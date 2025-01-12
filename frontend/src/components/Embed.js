import React, { useEffect, useRef } from 'react';

export const Embed = ({ url }) => {
    const embedControllerRef = useRef(null);

    useEffect(() => {
        const script = document.createElement('script');
        script.src = "https://open.spotify.com/embed/iframe-api/v1";
        script.async = true;
        script.onload = () => {
            if (window.onSpotifyIframeApiReady) {
                window.onSpotifyIframeApiReady = (IFrameAPI) => {
                    const element = document.getElementById('embed-iframe');
                    const options = {
                        uri: url,
                    };
                    const callback = (EmbedController) => {
                        embedControllerRef.current = EmbedController;
                    };
                    IFrameAPI.createController(element, options, callback);
                };
            }
        };
        document.body.appendChild(script);
    }, [url]);

    return (
        <div id="embed-iframe" style={{ width: 300, height: 380, border: 0 }}></div>
    );
};
