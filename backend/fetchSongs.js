const { getDb } = require('./db');
require('dotenv').config();
const cron = require('node-cron');
const SpotifyWebApi = require('spotify-web-api-node');


// create a new instance of the SpotifyWebApi
const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

// map moods to keywords 
const moodToGenres = {
    happy: ["pop", "dance", "happy","electronic", "party"],
    sad: ["sad", "blues", "acoustic"],
    angry: ["rock", "heavy metal", "punk"],
    neutral: ["chill", "ambient", "classical"],
    fear: ["dark ambient", "dark wave", "thriller", "horror soundtrack"],
    surprise: ["indie", "jazz", "reggae"],
    disgust: ["hip-hop", "reggaeton", "trap"]
};

const refreshAccessToken = async () => {
    try {
        const data = await spotifyApi.clientCredentialsGrant();
        spotifyApi.setAccessToken(data.body['access_token']);
    } catch (err) {
        console.error('Failed to refresh access token:', err);
    }
};

const fetchAndStoreSongs = async () => {
    await refreshAccessToken();
    // Get the existing database connection
    const db = getDb();


    for (const [mood, genres] of Object.entries(moodToGenres)) {
        const tracks = [];
        for (const genre of genres) {
            const response = await spotifyApi.searchTracks(`genre:"${genre}"`, { limit: 34 });
            tracks.push(...response.body.tracks.items);
            if (tracks.length >= 100) break;
        }
        await db.collection(mood).deleteMany({});
        await db.collection(mood).insertMany(tracks.map(track => ({
            url: track.external_urls.spotify,
            name: track.name,
            artist: track.artists.map(a => a.name).join(', ')
        })));
    }
};

// Schedule the script to run every week (Sunday at midnight, US Eastern Time)
cron.schedule('0 0 * * 0', fetchAndStoreSongs, {
    scheduled: true,
    timezone: "America/New_York"
});

module.exports = fetchAndStoreSongs


console.log('Scheduled song fetching service started. Waiting to execute...');