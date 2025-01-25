// API endpoints and configuration
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';
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

        const response = await fetch(proxyUrl, {
            headers: {
                'Accept': 'application/json',
                'x-requested-with': 'XMLHttpRequest'
            }
        });
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