const express = require('express');
const { ObjectId } = require('mongodb');
const { connectToDb, getDb } = require('./db');
const session = require('express-session');
require('dotenv').config();
const { URL, URLSearchParams } = require('url');

let fetch;
(async () => {
  fetch = (await import('node-fetch')).default;
})();


// initialize app and middleware
const app = express();
app.use(express.json());
app.use(session({
    secret: process.env.APP_SECRET,
    resave: false,
    saveUninitialized: true
}));

const port = 4000;
let db;

// connect to db
connectToDb(err => {
  if (!err) {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
    db = getDb();
  }
});

// OAuth configuration
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:4000/callback';

// Spotify API URLs
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_USER_PROFILE_URL = 'https://api.spotify.com/v1/me';
const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1/';

//routes 
app.get('/', (req,res) =>{
    res.json({message: 'Welcome to Moodify'});
})

app.get('/login', (req,res) => {
    const scopes = [
        'user-read-private',
        'user-read-email',
        'streaming',
        'user-modify-playback-state',
        'user-read-playback-state',
        'user-read-currently-playing'
    ].join(' ');

    //create a new URL object with the Spotify auth
    const SPOTIFY_AUTH_URL = new URL('https://accounts.spotify.com/authorize');

    // Use URLSearchParams to handle the encoding
    SPOTIFY_AUTH_URL.search = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: scopes,
        redirect_uri: REDIRECT_URI
    }).toString();

    res.redirect(SPOTIFY_AUTH_URL.href);
})

app.get('/callback', async (req,res) => {
    const {code, error} = req.query;

    //handle error 
    if (error) {
        console.error('Spotify OAuth error:', error);
        return res.status(401).json({ message: 'Authorization failed. Please try again.' });
    }

    try{
        const token_response = await fetch(SPOTIFY_TOKEN_URL, {
            method : 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI
            })
        });

        const token_data = await token_response.json();
        if (token_data.error) {
            console.error('Error exchanging code for access token:', token_data.error);
            return res.status(500).json({ message: 'Failed to authenticate with Spotify. Please try again.' });
        }

        // Store tokens in the session
        req.session.accessToken = token_data.access_token;
        req.session.refreshToken = token_data.refresh_token;
        req.session.expires_at = Date.now() + (token_data.expires_in * 1000);

        //Fetch user profile
        let user_profile = await fetch(SPOTIFY_USER_PROFILE_URL,{
            headers: {'Authorization': 'Bearer ' + token_data.access_token}
        });

        user_profile= await user_profile.json();
        const possible_user = await db.collection('users').findOne({ email: user_profile.email});

        if (possible_user){
            await db.collection('users').updateOne(
                {_id: possible_user._id},
                {$set: {name: user_profile.display_name, image: user_profile.images.length > 0 ? user_profile.images[0].url : possible_user.image, email: user_profile.email}})
                req.session.userId = possible_user._id;
                return res.status(201).json(possible_user);
        } else {
            const user = {
                email: user_profile.email,
                name: user_profile.display_name,
                image: user_profile.images.length > 0 ? userData.images[0].url : null
            }
            const result = await db.collection('users').insertOne(user);
            const inserted_id = result.insertedId;
            new_user = await db.collection('users').findOne({_id: inserted_id});
            req.session.userId = new_user._id;
            return res.status(201).json(new_user);
        }

    } catch(err){
        console.error('Error exchanging code for access token:', err);
        return res.status(500).json({ message: 'Internal server error during authentication. Please try again.' });
    }
});