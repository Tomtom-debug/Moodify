import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { TypingAnimation } from './TypingAnimation';
import Webcam from 'react-webcam';
import { jwtDecode } from 'jwt-decode';

export const Home = ({ setCurrentSong, setUserImage, currentSong}) => {
    const [inputValue, setInputValue] = useState('');
    //const [userImage, setUserImage] = useState(null);
    const [chatLog, setChatLog] = useState([]);
    const [loading, setLoading] = useState(false);
    //const [showWebcam, setShowWebcam] = useState(false);
    //const [showAnalysisMessage, setShowAnalysisMessage] = useState(false);
    const webcamRef = useRef(null);
    const chatContainerRef = useRef(null);
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const [greetingMessage, setGreetingMessage] = useState('');
    

    

    useEffect(() => {
        const fetchData = async () => {
            let userData = null;
    
            // Decode token and set user image
            if (token) {
                userData = jwtDecode(token);
                console.log(userData); // { image: 'image_url', name: 'User Name' }
                setUserImage(userData.image);
            }
    
            // Generate and set the greeting message only once
            const generatedGreeting = userData
                ? `Hello, ${userData.name}! I am Moodify, your personal assistant here to analyze your mood and play songs for you. How can I help you today?`
                : "Hello! I am Moodify, your personal assistant here to analyze your mood and play songs for you. How can I help you today?";
            setGreetingMessage(generatedGreeting);
    
            try {
                // Fetch persistent data from the backend
                const response = await axios.get('http://localhost:4000/getState', { withCredentials: true });
                console.log('Fetched state:', response.data);
                const { chatLog: savedChatLog, currentSong: savedCurrentSong } = response.data;
    
                if (savedChatLog && savedChatLog.length > 0) {
                    setChatLog(savedChatLog);
                    setCurrentSong(savedCurrentSong || null); // Set current song if it exists
                } else {
                    // Use generatedGreeting if no saved data exists
                    setChatLog([{ type: 'bot', message: generatedGreeting }]);
                }
            } catch (error) {
                console.error('Error fetching saved state:', error);
                // Fallback to generatedGreeting if fetching fails
                setChatLog([{ type: 'bot', message: generatedGreeting }]);
            }
        };
    
        fetchData();
    }, []); // Empty dependency array to run only once

    useEffect(() => {
        const saveStateOnUnload = () => {
            const payload = {
                chatLog,
                currentSong,
            };
    
            axios.post('http://localhost:4000/saveState', payload, { withCredentials: true })
                .then(() => console.log('State saved on unload'))
                .catch((error) => console.error('Error saving state on unload:', error));
        };
    
        window.addEventListener('beforeunload', saveStateOnUnload);
    
        return () => {
            window.removeEventListener('beforeunload', saveStateOnUnload);
        };
    }, [chatLog, currentSong]);


    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatLog]);

    const handleSubmit = (event) => {
        event.preventDefault();
        console.log(inputValue);
        const userMessage = { type: 'user', message: inputValue };
        setChatLog((prevChatLog) => [...prevChatLog, userMessage]);
        setInputValue('');
        sendMessage(inputValue);
    };

    const captureImage = () => {
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
            //setShowWebcam(false);
            analyzeMood(imageSrc);
        }
    };

    const analyzeMood = (imageSrc) => {
        setLoading(true);
        setChatLog((prevChatLog) => [...prevChatLog, { type: 'bot', message: 'Analyzing your mood...' }]);
        setLoading(true);
        axios.post('http://localhost:4000/analyzeMood', { image: imageSrc }, { withCredentials: true })
            .then((response) => {
                console.log("Mood analysis response:", response.data);
                const mood = response.data.mood;
                console.log("Mood:", mood);
                const prompt = `The user's mood is detected as ${mood}. Generate a friendly response based on this mood. example: "I see you are feeling happy today." and always end with "playing you a song now to match your mood."`;
                return generateResponse(prompt)
                .then(() => {
                    return playSong(mood);
                })
                .finally(() => {
                    setLoading(false);
                });
            })
            .catch((error) => {
                console.error('Error analyzing mood:', error);
                setLoading(false);
            });
    };

    const generateResponse = (prompt) => {
        console.log('Generating response...');
        return axios.post('http://localhost:4000/generateResponse', { prompt: prompt }, { withCredentials: true })
            .then((response) => {
                console.log('Response generated:', response.data);
                setChatLog((prevChatLog) => [...prevChatLog, { type: 'bot', message: response.data.message }]);
            })
            .catch((error) => {
                console.error('Error generating response:', error);
        });
    };

    const playSong = (mood) => {
        axios.post('http://localhost:4000/playSong', { mood }, { withCredentials: true })
          .then((response) => {
            const songData = {
              name: response.data.songName,
              artist: response.data.artist,
              image: response.data.albumArt || "/placeholder-song.jpg",
              embedUrl: response.data.embedUrl,
            };
            setCurrentSong(songData); // Update the global current song
            setChatLog((prevChatLog) => [...prevChatLog, { type: "bot", message: `Now playing: ${songData.name} by ${songData.artist}` }]);
          })
          .catch((error) => console.error("Error playing song:", error));
    };

    const sendMessage = (message) => {
        setLoading(true);
        const payload = {
            message: message,
            chatLog: chatLog.map(chat => ({ type: chat.type, message: chat.message }))
        };

        axios.post('http://localhost:4000/generate', payload, { withCredentials: true })
            .then((response) => {
                console.log(response.data);
                if (response.data.message === 'play song' || response.data.message === 'song recommendation') {
                    {/*setShowAnalysisMessage(true); 
                    setTimeout(() => {
                        setShowAnalysisMessage(false);
                        setShowWebcam(true);  
                    }, 3000); \*/}
                    setTimeout(() => {
                        captureImage();
                    }, 2000); // Delay of 2 seconds
                }else if (response.data.message === 'skip to next') {
                    axios.get('http://localhost:4000/skipNext', { withCredentials: true })
                        .then((response) => {
                            const songData = {
                                name: response.data.songName,
                                artist: response.data.artist,
                                image: response.data.albumArt || "/placeholder-song.jpg",
                                embedUrl: response.data.embedUrl,
                              };
                              setCurrentSong(songData); // Update the global current song
                              setChatLog((prevChatLog) => [...prevChatLog, { type: "bot", message: `Now playing: ${songData.name} by ${songData.artist}` }]);
                        })
                        .catch((error) => {
                            console.error('Error skipping to next song:', error);
                            setChatLog((prevChatLog) => [...prevChatLog, { type: 'bot', message: response.data.error }]);
                        });
                } else if (response.data.message === 'skip to previous' || response.data.message === 'pause' || response.data.message === 'resume song') {
                    setChatLog((prevChatLog) => [...prevChatLog, { type: 'bot', message: "This feature is coming soon! 😊 Stay tuned for updates." }]);
                } else if (response.data.message === 'greetings'){
                    setChatLog((prevChatLog) => [...prevChatLog, { type: 'bot', message: greetingMessage }]);
                } else {
                    setChatLog((prevChatLog) => [...prevChatLog, { type: 'bot', message: response.data.message }]);
                }
                setLoading(false);
            })
            .catch((error) => {
                console.error('Error sending message:', error);
                setLoading(false);
            });
    };

    return (
        <div className='font-ntr container mx-auto max-w-[700px]'>
            <div className="flex flex-col h-screen" style={{ paddingTop: '60px' }}>
                <div 
                className="flex-grow overflow-y-auto p-6" 
                ref={chatContainerRef}
                style={{
                    scrollbarWidth: 'none', // Firefox
                    msOverflowStyle: 'none', // IE and Edge
                }}>
                    <div className="flex flex-col space-y-4">
                        {
                            chatLog.map((chat, index) => (
                                <div key={index} className={`flex ${chat.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`flex ${chat.type === 'user' ? 'bg-green-500' : 'bg-gray-500'} rounded-lg p-2 text-white max-w-sm`}>
                                        {chat.message}
                                    </div>
                                </div>
                            ))
                        }
                        {loading && (
                            <div key={chatLog.length} className="flex justify-start">
                                <div className="bg-gray-500 rounded-lg p-4 text-white max-w-sm">
                                    <TypingAnimation />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {/*{showAnalysisMessage && (
                    <div className="flex justify-center p-6">
                        <div className="bg-gray-700 text-white p-4 rounded-lg">
                            Using webcam to analyze your mood...
                        </div>
                    </div>
                )}
                {showWebcam && (
                    <div className="webcam-container absolute bottom-0 left-0 right-0 flex flex-col items-center p-6 bg-white z-10">
                        <Webcam
                            audio={false}
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            muted={false}
                        />
                        <button onClick={captureImage} className="bg-green-500 rounded-lg px-4 py-2 text-white font-semibold focus:outline-none hover:bg-green-600 transition-colors duration-300">Capture Image</button>
                    </div>
                )} */}
                <form onSubmit={handleSubmit} className='flex-none p-6 '>
                    <div className="flex rounded-lg border border-gray-700 bg-gray-800">
                        <input type="text" className='flex-grow px-4 py-2 bg-transparent text-white focus:outline-none' placeholder='Type your message...' value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
                        <button type="submit" className='bg-green-500 rounded-lg px-4 py-2 text-white font-semibold focus:outline-none hover:bg-green-600 transition-colors duration-300'>Send</button>
                    </div>
                </form>
                <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    style={{ visibility: 'hidden', position: 'absolute', top: '-9999px' }}
                />
            </div>
        </div>
    );
};
