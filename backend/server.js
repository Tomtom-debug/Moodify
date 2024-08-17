const express = require('express');
const { ObjectId } = require('mongodb');
const { connectToDb, getDb } = require('./db');
const session = require('express-session');
require('dotenv').config();
const { URL, URLSearchParams } = require('url');
const OpenAI = require('openai');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const MongoStore = require('connect-mongo');

let fetch;
(async () => {
  fetch = (await import('node-fetch')).default;
})();


// initialize app and middleware
const app = express();
app.use(express.json({ limit: '50mb' }));

// Configure CORS
const corsOptions = {
    origin: 'http://localhost:3000',
    credentials: true,
    optionsSuccessStatus: 200 // For legacy browser support
  };
  
app.use(cors(corsOptions)); // Use CORS with the specified options
  

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

//MongoDB URI
const mongoUri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@cluster0.ck4xggj.mongodb.net/${process.env.MONGODB_DB_NAME}?retryWrites=true&w=majority&appName=Cluster0`;

//session middleware configuration
app.use(session({
    secret: process.env.APP_SECRET, 
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: mongoUri, 
        collectionName: 'sessions', 
        ttl: 14 * 24 * 60 * 60 // Session expiration time in seconds (14 days)
    }),
    cookie: {
        secure: false, // Set to true in production with HTTPS
        maxAge: 14 * 24 * 60 * 60 * 1000 // Cookie expiration time in milliseconds (14 days)
    }
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
    // run the fetchSongs after starting the server
    //const fetchAndStoreSongs = require('./fetchSongs');
    //fetchAndStoreSongs();  
  } else{
    console.error('Failed to start server:', err);
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


// helper functions 
// function to refresh the access token
const refreshAccessToken = async (req) => {
    try{
        const token_response = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: req.session.refreshToken
            })
        });

        const token_data = await token_response.json();
        if (token_data.error) {
            console.error('Error refreshing access token:', token_data.error);
            return {error: 'Failed to refresh access token. Please log in again.'};
        }

        req.session.accessToken = token_data.access_token;
        req.session.expires_at = Date.now() + (token_data.expires_in * 1000);
        return {accessToken: token_data.access_token};
    } catch(err){
        console.error('Error refreshing access token:', err);
        return {error: 'Internal server error during token refresh. Please try again.'};
    }
}

// Helper function to generate response
async function generateChatResponse(message, chatLog) {
    console.log('generateResponse called with message:', message, 'chatLog:', chatLog);

    chatLog = chatLog || [];
    const context = chatLog.map(entry => `${entry.type === 'user' ? 'User' : 'Bot'} says: "${entry.message}"`).join('\n');
    const prompt = `Given the following conversation, respond to the latest user message considering their mood and the potential need for a song suggestion from Spotify.\n${context}\nUser says: "${message}"\nResponse:`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: prompt },
            ],
        });

        console.log('OpenAI response for generation:', JSON.stringify(response, null, 2));
        return { success: true, response: response.choices[0].message.content.trim() };
    } catch (error) {
        console.error('Error generating response:', error);
        return { success: false, error: 'Failed to generate response.' };
    }
}



// Helper function to get intent
async function getIntent(message, chatLog) {
    console.log('getIntent called with message:', message, 'chatLog:', chatLog);

    chatLog = chatLog || [];
    const historyContext = chatLog.map(entry => `${entry.type === 'user' ? 'User' : 'Bot'} says: "${entry.message}"`).join('\n');

    const examples = `
    Examples:
    User says: "Can you play a happy song?"
    Intent: "song recommendation"

    User says: "Pause the music"
    Intent: "pause"

    User says: "Hi, how are you?"
    Intent: "greetings"

    User says: "Skip this track"
    Intent: "skip"

    User says: "Play some music"
    Intent: "play"

    User says: "Play a song"
    Intent: "play"
    `;

    const prompt = `"${message} \nstrictly analyse and put the above message under one of these categories: "play song", "resume song", "skip to next", "skip to previous","pause", "song recommendation", "greetings". Return only the intent. Do not strictly pick keywords that match the categories, but look for the intent. If the intent does not fall into any of the above, return null. Do not generate any other response.\nConsider the context of the chat history for clues ${historyContext}`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: prompt },
            ],
        });

        console.log('OpenAI response for intent:', JSON.stringify(response, null, 2));
        let intent = response.choices[0].message.content.trim();
        if (intent === "null" || !["play song", "resume song" ,"skip to next", "skip to previous", "pause", "song recommendation", "greetings"].includes(intent.toLowerCase())) {
            intent = null;
        }

        console.log('Determined intent:', intent);
        return { success: true, intent: intent };
    } catch (error) {
        console.error('Error fetching intent:', error);
        return { success: false, error: 'Failed to determine intent.' };
    }
}

async function generateResponse(prompt) {
  
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt },
        ],
      });
  
      console.log('OpenAI response for mood response:', JSON.stringify(response, null, 2));
      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating mood response:', error);
      return `Would you like me to play a song for you?`;
    }
  }

  // Helper function to check token
  const checkToken = async (req, res) => {
    if (!req.session.accessToken) {
        console.log('No access token found in session.');
        console.log(req.session.accessToken);
        console.log(req.session.refreshToken);
        console.log(req.session.expires_at);
        console.log(Date.now());
        return { success: false, status: 401, message: 'Unauthorized access.' };
    }
    if (Date.now() > req.session.expires_at) {
        const token_refresh = await refreshAccessToken(req);
        if (token_refresh.error) {
            console.error('Failed to refresh access token:', token_refresh.error);
            return { success: false, status: 500, message: token_refresh.error };
        }
    }
    return { success: true };
};






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

app.get('/callback', async (req, res) => {
    const { code, error } = req.query;

    // Handle error 
    if (error) {
        console.error('Spotify OAuth error:', error);
        return res.status(401).json({ message: 'Authorization failed. Please try again.' });
    }

    try {
        const token_response = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
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

        const rawResponse = await token_response.text();

        try {
            const token_data = JSON.parse(rawResponse);

            if (token_data.error) {
                console.error('Error exchanging code for access token:', token_data.error);
                return res.status(500).json({ message: 'Failed to authenticate with Spotify. Please try again.' });
            }

            // Store tokens in the session
            console.log('Session before saving tokens:', req.session);
            req.session.accessToken = token_data.access_token;
            req.session.refreshToken = token_data.refresh_token;
            req.session.expires_at = Date.now() + (token_data.expires_in * 1000);
            

            // Fetch user profile
            let user_profile_response = await fetch(SPOTIFY_USER_PROFILE_URL, {
                headers: { 'Authorization': 'Bearer ' + token_data.access_token }
            });

            const rawUserProfile = await user_profile_response.text(); // Log raw profile response
            console.log('Raw user profile response:', rawUserProfile);

            try {
                let user_profile = JSON.parse(rawUserProfile);

                if (user_profile.error) {
                    console.error('Error fetching user profile:', user_profile.error);
                    return res.status(500).json({ message: 'Failed to fetch user profile.' });
                }

                const possible_user = await db.collection('users').findOne({ email: user_profile.email });

                if (possible_user) {
                    await db.collection('users').updateOne(
                        { _id: possible_user._id },
                        {
                            $set: {
                                name: user_profile.display_name,
                                image: user_profile.images.length > 0 ? user_profile.images[0].url : possible_user.image,
                                email: user_profile.email
                            }
                        }
                    );
                    req.session.userId = possible_user._id;
                } else {
                    const user = {
                        email: user_profile.email,
                        name: user_profile.display_name,
                        image: user_profile.images.length > 0 ? user_profile.images[0].url : null
                    };
                    const result = await db.collection('users').insertOne(user);
                    const inserted_id = result.insertedId;
                    const new_user = await db.collection('users').findOne({ _id: inserted_id });
                    req.session.userId = new_user._id;
                }
                req.session.save((err) => {
                    if (err) {
                        console.error('Session save error:', err);
                    } else {
                        console.log('Session saved successfully.');
                    }
                });
                console.log('Session after saving tokens:', req.session);


                res.redirect('http://localhost:3000/home');
            } catch (jsonError) {
                console.error('Error parsing user profile JSON:', jsonError);
                return res.status(500).json({ message: 'Failed to parse user profile from Spotify.' });
            }

        } catch (jsonError) {
            console.error('Error parsing token JSON:', jsonError);
            return res.status(500).json({ message: 'Failed to parse response from Spotify.' });
        }

    } catch (err) {
        console.error('Error exchanging code for access token:', err);
        return res.status(500).json({ message: 'Internal server error during authentication. Please try again.' });
    }
});

app.get('/user', async (req,res) => {
    console.log('Session data in /user route:', req.session);

    
    const tokenCheck = await checkToken(req, res);
    if (!tokenCheck.success) {
        console.log('Token check failed:', tokenCheck.message);
        return res.status(tokenCheck.status).json({ error: tokenCheck.message });
    }
    
    console.log('Token check successful.');

    const user = db.collection('users').findOne({_id: new ObjectId(req.session.userId)})
    res.status(200).json(user)
})

app.get('/users', async (req,res) => {
    console.log('Session data in /users route:', req.session);

    
    const tokenCheck = await checkToken(req, res);
    if (!tokenCheck.success) {
        console.log('Token check failed:', tokenCheck.message);
        return res.status(tokenCheck.status).json({ error: tokenCheck.message });
    }
    
    console.log('Token check successful.');

    const { message, chatLog } = req.body;
    let users = []
    db.collection('users').find()
        .forEach( book => {
            users.push(book);
        })
        .then(() =>{
            res.status(200).json({"users" : users})
        }).catch (err => {
            console.log(err)
            res.status(500).json({ message: 'Internal server error during data fetch. Please try again.' });
        })
})

app.get('/logout', (req,res) => {
    if (req.session.accessToken) {
        req.session.destroy();
        res.redirect('http://localhost:3000/');
    }
    res.status(401).json({message: 'Unauthorized access'});
})

// Endpoint to handle message generation
app.post('/generate', async (req, res) => {
    console.log('Request received at /generate with body:', req.body);
    console.log('Session data in /generate route:', req.session);

    
    const tokenCheck = await checkToken(req, res);
    if (!tokenCheck.success) {
        console.log('Token check failed:', tokenCheck.message);
        return res.status(tokenCheck.status).json({ error: tokenCheck.message });
    }
    
    console.log('Token check successful.');

    const { message, chatLog } = req.body;

    try {
        console.log('Calling getIntent with message:', message);
        const intentResult = await getIntent(message, chatLog);
        console.log('Intent result:', intentResult);
        if (!intentResult.success) {
            console.log('Intent determination failed.');
            return res.status(500).json({ error: intentResult.error });
        }

        let responseMessage;
        if (intentResult.intent === null) {
            //const responseResult = await generateChatResponse(message, chatLog);
            //console.log('Response result:', responseResult);
            //if (!responseResult.success) {
                //return res.status(500).json({ error: responseResult.error });
            //}
            //responseMessage = responseResult.response;
            console.log('No specific intent detected. Asking user if they want a song.');
            responseMessage = 'Would you like me to play a song for you?';
        } else {
            console.log('Intent detected:', intentResult.intent);
            responseMessage = intentResult.intent;
        }

        console.log('Final response message:', responseMessage);
        return res.status(200).json({ message: responseMessage });
    } catch (error) {
        console.error('Error handling request:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.post('/analyzeMood', async (req, res) => {
    const tokenCheck = await checkToken(req, res);
    if (!tokenCheck.success) {
        console.log('Token check failed:', tokenCheck.message);
        return res.status(tokenCheck.status).json({ error: tokenCheck.message });
    }
    const { image } = req.body;

    const pythonProcess = spawn('python3', ['analyze_mood.py']);

    pythonProcess.stdin.write(JSON.stringify({ image: image }));
    pythonProcess.stdin.end();

    let responseSent = false;
    let buffer = '';

    pythonProcess.stdout.on('data', (data) => {
        const rawData = data.toString();
        buffer += rawData;

        // Attempt to parse the buffer as JSON only if it contains valid JSON
        try {
            const result = JSON.parse(buffer);
            const emotion = result[0]['dominant_emotion']; // Get the dominant emotion
            if (!responseSent) {
                res.json({ message: `Your mood is detected as ${emotion}. Here's a song recommendation for you!`, mood: emotion });
                responseSent = true;
            }
        } catch (error) {
            // If JSON parsing fails, it might be due to incomplete data
            console.error('Error parsing JSON (might be due to partial data):', error);
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        const errorMessage = data.toString();
        console.error('Error analyzing mood:', errorMessage);
        if (!responseSent) {
            res.status(500).json({ error: 'Failed to analyze mood.', details: errorMessage });
            responseSent = true;
        }
    });

    pythonProcess.on('close', (code) => {
        if (!responseSent) {
            res.status(500).json({ error: `Python script exited with code ${code}` });
        }
    });
});

app.post('/generateResponse', async (req, res) => {
    const tokenCheck = await checkToken(req, res);
    if (!tokenCheck.success) {
        console.log('Token check failed:', tokenCheck.message);
        return res.status(tokenCheck.status).json({ error: tokenCheck.message });
    }
    const {prompt} = req.body;
    const response = await generateResponse(prompt);
    return res.status(200).json({message: response});
});

app.get('/pauseSong', async (req, res) => {
    try {
        const tokenCheck = await checkToken(req, res);
        if (!tokenCheck.success) {
            console.log('Token check failed:', tokenCheck.message);
            return res.status(tokenCheck.status).json({ error: tokenCheck.message });
        }
        const response = await fetch(SPOTIFY_API_BASE_URL + 'me/player/pause', {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + req.session.accessToken, 
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 200) { 
            res.status(200).json({ message: 'Playback paused successfully.' });
        } else if (response.status === 404) {
            res.status(404).json({ message: 'No active device found. Please start playback on a device first.' });
        } else {
            console.log('Error pausing song:', response.statusText);
            const errorData = await response.json();
            res.status(response.status).json({ error: errorData });
        }

    } catch (error) {
        console.error('Error pausing song:', error);
        res.status(500).json({ error: 'Failed to pause song.' });
    }
});

app.get('/skipNext', async (req, res) => {
    try {
        const tokenCheck = await checkToken(req, res);
        if (!tokenCheck.success) {
            console.log('Token check failed:', tokenCheck.message);
            return res.status(tokenCheck.status).json({ error: tokenCheck.message });
        }

        const response = await fetch(SPOTIFY_API_BASE_URL + 'me/player/next', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + req.session.accessToken,
                'Content-Type': 'application/json'
            }
        });

        console.log('Response status:', response.status);

        if (response.status === 200) {
            // Success case
            console.log('Skipped to the next song successfully.');
            res.status(200).json({ message: 'Skipped to the next song successfully.' });
        } else if (response.status === 400) {
            // Handle cases where there is no active device
            res.status(404).json({ message: 'No active device found. Please start playback on a device first.' });
        } else {
            console.error('Unexpected response from Spotify:', response.statusText);
            res.status(response.status).json({ error: response.statusText });
        }
    } catch (error) {
        console.error('Error skipping to next song:', error);
        res.status(500).json({ error: 'Failed to skip to next song.' });
    }
});



app.get('/skipPrevious', async (req, res) => {
    try {
        const tokenCheck = await checkToken(req, res);
        if (!tokenCheck.success) {
            console.log('Token check failed:', tokenCheck.message);
            return res.status(tokenCheck.status).json({ error: tokenCheck.message });
        }
        const response = await fetch(SPOTIFY_API_BASE_URL + 'me/player/previous', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + req.session.accessToken,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 200) {
            res.status(200).json({ message: 'Skipped to the previous song successfully.' });
        } else if (response.status === 404) {
            res.status(404).json({ message: 'No active device found. Please start playback on a device first.' });
        } else {
            const errorData = await response.json();
            res.status(response.status).json({ error: errorData });
        }
    } catch (error) {
        console.error('Error skipping to previous song:', error);
        res.status(500).json({ error: 'Failed to skip to previous song.' });
    }
});

app.get('/resumeSong', async (req, res) => {
    try {
        const tokenCheck = await checkToken(req, res);
        if (!tokenCheck.success) {
            console.log('Token check failed:', tokenCheck.message);
            return res.status(tokenCheck.status).json({ error: tokenCheck.message });
        }

        const response = await fetch(SPOTIFY_API_BASE_URL + 'me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + req.session.accessToken,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 200) { 
            res.status(200).json({ message: 'Playback resumed successfully.' });
        } else if (response.status === 404) {
            res.status(404).json({ message: 'No active device found. Please start playback on a device first.' });
        } else {
            const errorData = await response.json();
            res.status(response.status).json({ error: errorData });
        }

    } catch (error) {
        console.error('Error resuming playback:', error);
        res.status(500).json({ error: 'Failed to resume playback.' });
    }
});

app.post('/playSong', async (req, res) => {
    console.log('Request received at /playSong with body:', req.body);
    console.log(req.session.userId);
    const tokenCheck = await checkToken(req, res);
    if (!tokenCheck.success) {
        console.log('Token check failed:', tokenCheck.message);
        return res.status(tokenCheck.status).json({ error: tokenCheck.message });
    }
    const mood = req.body.mood;
    console.log('Mood:', mood);

    try {
        const randomSongs = await db.collection(mood).aggregate([{ $sample: { size: 16 } }]).toArray();
        console.log('Random songs:', randomSongs);

        if (randomSongs.length === 0) {
            console.log('No songs found for this mood.');
            return res.status(404).json({ message: 'No songs found for this mood.' });
        }

        const accessToken = req.session.accessToken;
        console.log('Access token:', accessToken);
        if (!accessToken) {
            console.log('No access token found.');
            return res.status(401).json({ message: 'Unauthorized. No access token found.' });
        }

        // Convert URLs to Spotify URIs
        const uris = randomSongs.map(song => `spotify:track:${song.url.split('/track/')[1]}`);
        
        // Optionally fetch the user's devices and get the first available device ID
        const devicesResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            }
        });
        
        const devices = await devicesResponse.json();
        console.log('Devices:', devices);
        const activeDevice = devices.devices && devices.devices.length > 0 ? devices.devices[0].id : null;

        // Play the first song
        console.log('Playing song:', randomSongs[0].name);
        console.log('Active device:', activeDevice);
        console.log('URIs:', uris);
        const playResponse = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                uris: [uris[0]], // Play the first song immediately
                device_id: activeDevice // Optional: specify device_id
            })
        });

        if (playResponse.status !== 204) {
            console.error('Failed to play the song:', playResponse.statusText);
            const errorData = await playResponse.json();
            return res.status(playResponse.status).json({ message: 'Failed to play the song.', error: errorData });
        }

        console.log('Song played successfully.');

        // Queue the next 15 songs
        for (let i = 1; i < uris.length; i++) {
            console.log('Queueing song:', randomSongs[i].name);
            await fetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uris[i])}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                }
            });
        }
        console.log('Songs queued successfully.');

        res.status(200).json({ message: `Now playing: ${randomSongs[0].name} by ${randomSongs[0].artist}` });
    } catch (error) {
        console.error('Error playing song:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});
