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

app.use(session({
    secret: process.env.APP_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // secure should be true in production with HTTPS
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
        console.log(req.session.accessToken);
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
            req.session.accessToken = token_data.access_token;
            req.session.refreshToken = token_data.refresh_token;
            req.session.expires_at = Date.now() + (token_data.expires_in * 1000);
            console.log('Access token:', token_data.access_token);
            console.log('saved in session:', req.session.accessToken);

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
    await checkToken(req,res);
    const user = db.collection('users').findOne({_id: new ObjectId(req.session.userId)})
    res.status(200).json(user)
})

app.get('/users', (re,res) => {
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
        res.status(200).json({message: 'Logged out successfully'});
    }
    res.status(401).json({message: 'Unauthorized access'});
})

// Endpoint to handle message generation
app.post('/generate', async (req, res) => {
    console.log('Request received at /generate with body:', req.body);
    
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
    await checkToken(req,res);
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
    await checkToken(req,res);
    const {prompt} = req.body;
    const response = await generateResponse(prompt);
    return res.status(200).json({message: response});
});

app.get('/pauseSong', async (req, res) => {
    try {
        await checkToken(req, res); 
        const response = await fetch(SPOTIFY_API_BASE_URL + 'me/player/pause', {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + req.session.accessToken, 
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 204) { 
            res.status(200).json({ message: 'Playback paused successfully.' });
        } else if (response.status === 404) {
            res.status(404).json({ message: 'No active device found. Please start playback on a device first.' });
        } else {
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
        await checkToken(req, res);
        const response = await fetch(SPOTIFY_API_BASE_URL + 'me/player/next', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + req.session.accessToken,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 204) {
            res.status(200).json({ message: 'Skipped to the next song successfully.' });
        } else if (response.status === 404) {
            res.status(404).json({ message: 'No active device found. Please start playback on a device first.' });
        } else {
            const errorData = await response.json();
            res.status(response.status).json({ error: errorData });
        }
    } catch (error) {
        console.error('Error skipping to next song:', error);
        res.status(500).json({ error: 'Failed to skip to next song.' });
    }
});

app.get('/skipPrevious', async (req, res) => {
    try {
        await checkToken(req, res);
        const response = await fetch(SPOTIFY_API_BASE_URL + 'me/player/previous', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + req.session.accessToken,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 204) {
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
        await checkToken(req, res);

        const response = await fetch(SPOTIFY_API_BASE_URL + 'me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + req.session.accessToken,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 204) { 
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
