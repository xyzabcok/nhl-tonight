// API endpoints and configuration
const CORS_PROXY = 'https://corsproxy.io/?';
const NHL_API = 'https://api-web.nhle.com/v1';
const CURRENT_SEASON = '20242025';

// Cache for API responses
const cache = {
    schedules: new Map(),
    rosters: new Map(),
    lastUpdated: null,
    CACHE_DURATION: 5 * 60 * 1000 // 5 minutes in milliseconds
};

// Utility function to format date for API calls
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

// Enhanced fetch with better error handling
async function cachedFetch(url, cacheKey, forceFresh = false) {
    try {
        const proxyUrl = CORS_PROXY + encodeURIComponent(url);
        console.log('Attempting to fetch from:', proxyUrl); // Debug log
        
        // Check cache first
        if (!forceFresh && cache[cacheKey] && cache.lastUpdated && 
            (Date.now() - cache.lastUpdated < cache.CACHE_DURATION)) {
            console.log('Returning cached data for:', cacheKey);
            return cache[cacheKey];
        }

        const response = await fetch(proxyUrl);
        console.log('Response status:', response.status); // Debug log

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Received data:', data); // Debug log
        
        cache[cacheKey] = data;
        cache.lastUpdated = Date.now();
        return data;
    } catch (error) {
        console.error('Detailed fetch error:', {
            url,
            proxyUrl: CORS_PROXY + encodeURIComponent(url),
            error: error.message,
            stack: error.stack
        });
        throw new Error(`Failed to fetch data: ${error.message}`);
    }
}

// Get today's schedule with better error handling
async function fetchTodaysSchedule() {
    try {
        const scheduleUrl = `${NHL_API}/schedule/now`;
        console.log('Fetching schedule from:', scheduleUrl); // Debug log
        
        const data = await cachedFetch(scheduleUrl, 'schedules');
        
        if (!data || !data.gameWeek || !data.gameWeek[0]) {
            console.error('Invalid data structure:', data); // Debug log
            throw new Error('Invalid schedule data format');
        }
        
        console.log('Schedule data:', data.gameWeek[0].games); // Debug log
        return data.gameWeek[0].games || [];
    } catch (error) {
        console.error('Schedule fetch error:', error); // Debug log
        throw new Error(`Failed to fetch schedule: ${error.message}`);
    }
}

// Extract teams from schedule
function extractTeamsFromSchedule(games) {
    const teams = new Set();
    games.forEach(game => {
        teams.add(game.awayTeam.abbrev);
        teams.add(game.homeTeam.abbrev);
    });
    return Array.from(teams);
}

// Fetch roster for each team with concurrent requests
async function fetchPlayersFromTeams(teams) {
    const players = [];
    
    try {
        // Use Promise.all for concurrent requests
        const rosterPromises = teams.map(team => 
            cachedFetch(`${NHL_API}/roster/${team}/${CURRENT_SEASON}`, `roster-${team}`)
        );
        
        const rosters = await Promise.all(rosterPromises);
        
        rosters.forEach(data => {
            players.push(...data.forwards, ...data.defensemen, ...data.goalies);
        });
        
        return players;
    } catch (error) {
        throw new Error('Failed to fetch team rosters: ' + error.message);
    }
}

// Group players by region
function groupPlayersByRegion(players) {
    const grouped = {};
    
    players.forEach(player => {
        const region = player.birthStateProvince || 'International';
        if (!grouped[region]) {
            grouped[region] = [];
        }
        grouped[region].push({
            name: `${player.firstName} ${player.lastName}`,
            hometown: `${player.birthCity}, ${player.birthStateProvince || ''}, ${player.birthCountry}`,
            teamAbbrev: player.teamAbbrev,
            teamLogo: player.teamLogo,
            number: player.number,
            position: player.position
        });
    });
    
    // Sort regions alphabetically
    return Object.fromEntries(
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
    );
}

// Enhanced display function with visual improvements
function displayPlayers(groupedPlayers) {
    const container = document.querySelector('.regions-container');
    container.innerHTML = ''; // Clear existing content
    
    for (const [region, players] of Object.entries(groupedPlayers)) {
        const regionElement = document.createElement('div');
        regionElement.className = 'region';
        
        const playerCards = players.map(player => `
            <div class="player-card" style="background-color: ${getTeamColor(player.teamAbbrev)}">
                <div class="player-card-header">
                    <img class="team-logo" 
                         src="${player.teamLogo}" 
                         alt="${player.teamAbbrev}"
                         onerror="this.src='placeholder.png'">
                    ${player.number ? `<span class="player-number">#${player.number}</span>` : ''}
                </div>
                <div class="player-card-content">
                    <h3 class="player-name">${player.name}</h3>
                    <p class="player-hometown">${player.hometown}</p>
                    ${player.position ? `<p class="player-position">${player.position}</p>` : ''}
                </div>
            </div>
        `).join('');

        regionElement.innerHTML = `
            <h2 class="region-name">
                <span class="region-count">${players.length}</span>
                ${region}
            </h2>
            <div class="players-grid">
                ${playerCards}
            </div>
        `;
        
        container.appendChild(regionElement);
    }
}

// Add team colors
const teamColors = {
    'WSH': '#C8102E',
    'TOR': '#00205B',
    'MTL': '#AF1E2D',
    // Add more team colors as needed
};

function getTeamColor(teamAbbrev) {
    return teamColors[teamAbbrev] || '#f8fafc'; // Default color if team not found
}

// Main function to initialize the application
async function initializeApp() {
    try {
        showLoading();
        
        const todaysGames = await fetchTodaysSchedule();
        const playingTeams = extractTeamsFromSchedule(todaysGames);
        const playersList = await fetchPlayersFromTeams(playingTeams);
        const groupedPlayers = groupPlayersByRegion(playersList);
        
        displayPlayers(groupedPlayers);
        hideLoading();
    } catch (error) {
        handleError(error);
    }
}

// Enhanced loading state with progress indicator
function showLoading() {
    const container = document.querySelector('.regions-container');
    container.innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            <p class="loading-text">Loading player data...</p>
            <div class="loading-progress">
                <div class="progress-bar"></div>
            </div>
        </div>
    `;
}

function hideLoading() {
    const loadingElement = document.querySelector('.loading');
    if (loadingElement) {
        loadingElement.remove();
    }
}

// Enhanced error handling
function handleError(error) {
    console.error('Detailed error:', error); // Debug log
    const container = document.querySelector('.regions-container');
    container.innerHTML = `
        <div class="error-message">
            <p>Sorry, there was an error loading the player data.</p>
            <p>Error: ${error.message}</p>
            <button onclick="retryLoad()" class="retry-button">Try Again</button>
        </div>
    `;
}

// Add retry functionality
async function retryLoad() {
    try {
        await initializeApp();
    } catch (error) {
        handleError(error);
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', initializeApp);
