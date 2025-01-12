import React from "react";

const NowPlaying = ({ song }) => {
  if (!song) return null; // Don't show anything if no song is playing

  // Modify the embedUrl to include autoplay=1
  const autoplayUrl = `${song.embedUrl}?autoplay=1`;

  return (
    <div className="fixed bottom-4 right-4 bg-neutral-950 text-white p-4 rounded-lg shadow-lg w-80">
      <div className="flex flex-col">
        <p className="font-bold text-sm">{song.name || "Unknown Song"}</p>
        <p className="text-xs text-gray-400">{song.artist || "Unknown Artist"}</p>
      </div>
      <iframe
        title="Now Playing"
        src={autoplayUrl}
        width="100%"
        height="80"
        frameBorder="0"
        allow="autoplay; encrypted-media"
        className="mt-2"
      ></iframe>
    </div>
  );
};

export default NowPlaying;