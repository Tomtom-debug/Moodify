
export const Login = () => {
  return (
    <div className="font-ntr bg-white flex flex-col items-center justify-center h-screen relative">
      <nav className="text-lightest-slate font-ntr font-bold py-4 bg-neutral-950 w-full fixed top-0 left-0 flex items-center justify-center px-4 md:px-16">
        <div className="text-2xl font-bold text-green-bright">Welcome to Moodify</div>
      </nav>
      <div className="flex flex-col items-center justify-center mt-24">
        <button className="text-black text-xl font-bold py-2 px-8 rounded-full mb-4 border-2 border-green-500 hover:border-green-bright">
          Login
        </button>
        <p className="text-black">
          Don't have a Spotify account?{' '}
          <a
            href="https://www.spotify.com/us/signup?forward_url=https%3A%2F%2Fopen.spotify.com%2F"
            className="text-blue-500 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}

export default Login;
