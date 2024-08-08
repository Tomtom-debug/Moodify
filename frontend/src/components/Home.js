import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { TypingAnimation } from './TypingAnimation';
import Webcam from 'react-webcam';

export const Home = () => {
    const [inputValue, setInputValue] = useState('');
    const [chatLog, setChatLog] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showWebcam, setShowWebcam] = useState(false);
    const [showAnalysisMessage, setShowAnalysisMessage] = useState(false);
    const webcamRef = useRef(null);

    useEffect(() => {
        const greetingMessage = "Hello! I am Moodify, your personal assistant here to analyze your mood and play songs for you. How can I help you today?";
        const botMessage = { type: 'bot', message: greetingMessage };
        setChatLog([botMessage]);
    }, []);

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
            setShowWebcam(false);
            analyzeMood(imageSrc);
        }
    };

    const analyzeMood = (imageSrc) => {
        setLoading(true);
        setChatLog((prevChatLog) => [...prevChatLog, { type: 'bot', message: 'Analyzing your mood...' }]);
        axios.post('http://localhost:4000/analyzeMood', { image: imageSrc })
            .then((response) => {
                console.log("Mood analysis response:", response.data);
                setChatLog((prevChatLog) => [...prevChatLog, { type: 'bot', message: response.data.message }]);
                setLoading(false);
            })
            .catch((error) => {
                console.error('Error analyzing mood:', error);
                setLoading(false);
            });
    };

    const sendMessage = (message) => {
        setLoading(true);
        const payload = {
            message: message,
            chatLog: chatLog.map(chat => ({ type: chat.type, message: chat.message }))
        };

        axios.post('http://localhost:4000/generate', payload)
            .then((response) => {
                console.log(response.data);
                setChatLog((prevChatLog) => [...prevChatLog, { type: 'bot', message: response.data.message }]);
                if (response.data.message === 'play' || response.data.message === 'song recommendation') {
                    setShowAnalysisMessage(true); 
                    setTimeout(() => {
                        setShowAnalysisMessage(false);
                        setShowWebcam(true);  
                    }, 3000); 
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
                <div className="flex-grow overflow-y-auto p-6">
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
                {showAnalysisMessage && (
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
                        />
                        <button onClick={captureImage} className="bg-green-500 rounded-lg px-4 py-2 text-white font-semibold focus:outline-none hover:bg-green-600 transition-colors duration-300">Capture Image</button>
                    </div>
                )}
                <form onSubmit={handleSubmit} className='flex-none p-6 '>
                    <div className="flex rounded-lg border border-gray-700 bg-gray-800">
                        <input type="text" className='flex-grow px-4 py-2 bg-transparent text-white focus:outline-none' placeholder='Type your message...' value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
                        <button type="submit" className='bg-green-500 rounded-lg px-4 py-2 text-white font-semibold focus:outline-none hover:bg-green-600 transition-colors duration-300'>Send</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
