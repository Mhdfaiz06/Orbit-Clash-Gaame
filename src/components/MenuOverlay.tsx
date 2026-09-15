import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Globe,
  Radio,
  Copy,
  Check,
  Play,
  ArrowLeft,
  Share2,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Sparkles,
  Zap,
  X,
} from 'lucide-react';
import { GameMode, MultiplayerState, OnlineRole } from '../types';
import { network } from '../network';

interface MenuOverlayProps {
  currentMode: GameMode;
  onSelectLocal1v1: () => void;
  onSelectOnline: () => void;
  onStartOnlineGame: () => void;
  onBackToMenu: () => void;
  multiplayer: MultiplayerState;
  setMultiplayer: React.Dispatch<React.SetStateAction<MultiplayerState>>;
}

export const MenuOverlay: React.FC<MenuOverlayProps> = ({
  currentMode,
  onSelectLocal1v1,
  onSelectOnline,
  onStartOnlineGame,
  onBackToMenu,
  multiplayer,
  setMultiplayer,
}) => {
  const [onlineView, setOnlineView] = useState<'choose' | 'create' | 'join'>('choose');
  const [inputRoomId, setInputRoomId] = useState('');
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Ensure clean URL and avoid any persistent query parameter pre-filling
  useEffect(() => {
    if (window.location.search.includes('room=')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    setInputRoomId('');
  }, []);

  // Listen for network errors and connection events in lobby
  useEffect(() => {
    const unsubError = network.on('error', (data) => {
      setErrorMsg(data?.message || 'Connection error. Please try again.');
      setConnecting(false);
    });

    const unsubJoined = () => {
      setConnecting(false);
      setErrorMsg(null);
    };
    const unsubJoinedListener = network.on('room_joined', unsubJoined);

    const unsubCreated = () => {
      setConnecting(false);
      setErrorMsg(null);
    };
    const unsubCreatedListener = network.on('room_created', unsubCreated);

    return () => {
      unsubError();
      unsubJoinedListener();
      unsubCreatedListener();
    };
  }, []);

  // Handle "Create Room"
  const handleCreateRoom = async () => {
    network.leaveRoom();
    setMultiplayer({
      connected: false,
      roomId: null,
      role: null,
      opponentJoined: false,
      rematchRequestedByMe: false,
      rematchRequestedByOpponent: false,
      statusMessage: '',
      ping: 0,
    });
    setInputRoomId('');
    setErrorMsg(null);
    setConnecting(true);
    setOnlineView('create');

    const ok = await network.connect();
    setConnecting(false);

    if (!ok) {
      setErrorMsg('Failed to connect to multiplayer server. Please check your connection.');
      return;
    }

    network.createRoom();
  };

  // Handle "Join Room"
  const handleJoinRoom = async () => {
    const cleanId = inputRoomId.toUpperCase().trim();
    if (!cleanId) {
      setErrorMsg('Please enter a valid 6-character room code.');
      return;
    }

    setErrorMsg(null);
    setConnecting(true);

    const ok = await network.connect();
    setConnecting(false);

    if (!ok) {
      setErrorMsg('Failed to connect to multiplayer server. Please check your connection.');
      return;
    }

    network.joinRoom(cleanId);
  };

  // Copy Room Code to clipboard
  const handleCopyCode = () => {
    if (!multiplayer.roomId) return;
    navigator.clipboard.writeText(multiplayer.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Copy Direct Invite Link
  const handleCopyLink = () => {
    if (!multiplayer.roomId) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${multiplayer.roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="absolute inset-0 bg-black/85 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center z-30 overflow-y-auto">
      {/* Glow effects */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Mode Selection Screen */}
      {currentMode === 'menu' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="relative max-w-2xl w-full flex flex-col items-center"
        >
          {/* Futuristic Badge */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-cyan-300 text-xs font-mono mb-4 tracking-wider">
            <Radio size={14} className="text-cyan-400 animate-pulse" />
            <span>ORBITAL DEMOLITION COMBAT</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-black tracking-tight mb-3 italic uppercase">
            Orbital <span className="text-blue-500">Clash</span>
          </h1>

          <p className="text-sm md:text-base text-white/70 max-w-lg mb-8 leading-relaxed">
            Zero-G spaceship arena combat with single-point impact destruction, Newtonian momentum, and seamless boundary loops.
          </p>

          {/* 2 Primary Mode Choices */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full mb-8">
            {/* Mode 1: 1v1 Local */}
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={onSelectLocal1v1}
              id="mode-local-btn"
              className="group relative p-6 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/15 hover:border-blue-500/50 flex flex-col items-center text-center transition-all shadow-xl hover:shadow-[0_0_30px_rgba(59,130,246,0.25)] cursor-pointer"
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                <Users size={28} />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-white mb-2">
                1v1 Local Duel
              </h3>
              <p className="text-xs text-white/60 mb-4 leading-relaxed">
                Play on 1 shared keyboard or touch screen. Blue (WASD) vs Red (Arrow Keys).
              </p>
              <div className="mt-auto px-4 py-1.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-mono font-bold group-hover:bg-blue-500 group-hover:text-white transition-colors">
                Play Local 1v1
              </div>
            </motion.button>

            {/* Mode 2: Online Multiplayer */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                network.leaveRoom();
                setMultiplayer({
                  connected: false,
                  roomId: null,
                  role: null,
                  opponentJoined: false,
                  rematchRequestedByMe: false,
                  rematchRequestedByOpponent: false,
                  statusMessage: '',
                  ping: 0,
                });
                setInputRoomId('');
                setOnlineView('choose');
                setErrorMsg(null);
                onSelectOnline();
              }}
              id="mode-online-btn"
              className="group relative p-6 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/15 hover:border-emerald-500/50 flex flex-col items-center text-center transition-all shadow-xl hover:shadow-[0_0_30px_rgba(16,185,129,0.25)] cursor-pointer"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
                <Globe size={28} />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-white mb-2">
                Online Multiplayer
              </h3>
              <p className="text-xs text-white/60 mb-4 leading-relaxed">
                Create or join a private room across 2 devices. Both WASD & Arrows work on your device!
              </p>
              <div className="mt-auto px-4 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                Play Online
              </div>
            </motion.button>
          </div>

          <div className="text-[11px] font-mono text-white/40 tracking-wider">
            PORTAL BOUNDARIES • SINGLE IMPACT DESTRUCTION • MANUAL TRANSMISSION
          </div>
        </motion.div>
      )}

      {/* Online Multiplayer Lobby Screens */}
      {currentMode === 'online_lobby' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="relative max-w-xl w-full flex flex-col items-center"
        >
          {/* Back Button */}
          <button
            onClick={() => {
              network.leaveRoom();
              setMultiplayer({
                connected: false,
                roomId: null,
                role: null,
                opponentJoined: false,
                rematchRequestedByMe: false,
                rematchRequestedByOpponent: false,
                statusMessage: '',
                ping: 0,
              });
              setInputRoomId('');
              setErrorMsg(null);
              if (onlineView === 'choose') {
                onBackToMenu();
              } else {
                setOnlineView('choose');
              }
            }}
            className="self-start flex items-center gap-1.5 text-xs font-mono text-white/60 hover:text-white mb-4 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>{onlineView === 'choose' ? 'Back to Modes' : 'Change Option'}</span>
          </button>

          {/* Sub-view 1: Choose Create or Join */}
          {onlineView === 'choose' && (
            <div className="w-full flex flex-col items-center">
              <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs mb-2">
                <Globe size={16} />
                <span>ONLINE MULTIPLAYER ROOMS</span>
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tight mb-2">
                Private <span className="text-emerald-400">Match</span>
              </h2>
              <p className="text-xs text-white/60 max-w-md mb-6">
                Host a room as <strong>Blue Ship</strong> or join an existing room code as <strong>Red Ship</strong>.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-6">
                <button
                  id="create-room-choice-btn"
                  onClick={handleCreateRoom}
                  disabled={connecting}
                  className="p-5 rounded-2xl bg-gradient-to-b from-blue-500/20 to-blue-500/5 border border-blue-500/40 hover:border-blue-400 hover:bg-blue-500/25 flex flex-col items-center text-center transition-all cursor-pointer group"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-500/30 flex items-center justify-center text-blue-300 mb-3 group-hover:scale-110 transition-transform">
                    <Sparkles size={24} />
                  </div>
                  <span className="font-bold text-base text-white mb-1">Create a Room</span>
                  <span className="text-[11px] text-blue-200/70">Host a game as Blue Ship</span>
                </button>

                <button
                  id="join-room-choice-btn"
                  onClick={() => {
                    network.leaveRoom();
                    setMultiplayer({
                      connected: false,
                      roomId: null,
                      role: null,
                      opponentJoined: false,
                      rematchRequestedByMe: false,
                      rematchRequestedByOpponent: false,
                      statusMessage: '',
                      ping: 0,
                    });
                    setInputRoomId('');
                    setErrorMsg(null);
                    setOnlineView('join');
                  }}
                  className="p-5 rounded-2xl bg-gradient-to-b from-red-500/20 to-red-500/5 border border-red-500/40 hover:border-red-400 hover:bg-red-500/25 flex flex-col items-center text-center transition-all cursor-pointer group"
                >
                  <div className="w-12 h-12 rounded-xl bg-red-500/30 flex items-center justify-center text-red-300 mb-3 group-hover:scale-110 transition-transform">
                    <Users size={24} />
                  </div>
                  <span className="font-bold text-base text-white mb-1">Enter a Room</span>
                  <span className="text-[11px] text-red-200/70">Join with Room Code as Red Ship</span>
                </button>
              </div>

              {/* Online Controls Info Banner */}
              <div className="w-full p-4 rounded-xl bg-white/[0.04] border border-white/10 text-left text-xs font-mono text-white/70 space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5 mb-1.5">
                  <Zap size={14} className="text-amber-400" />
                  <span>MULTIPLAYER DUAL CONTROLS</span>
                </div>
                <p>• On your device, you can use <strong>BOTH WASD and Arrow Keys</strong> interchangeably to steer your car!</p>
                <p>• Creator is always <strong>Blue Ship</strong>; joining player is always <strong>Red Ship</strong>.</p>
                <p>• After every battle, both players stay in the room for instant rematches!</p>
              </div>
            </div>
          )}

          {/* Sub-view 2: Host Room Waiting Room */}
          {onlineView === 'create' && (
            <div className="w-full flex flex-col items-center">
              <div className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-mono mb-3">
                YOU ARE THE HOST • BLUE SHIP
              </div>

              <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight mb-2">
                Room Created
              </h2>

              <p className="text-xs text-white/60 mb-5">
                Share this Room Code with your opponent to connect.
              </p>

              {/* Big Room Code Box */}
              <div className="w-full max-w-sm p-4 rounded-2xl bg-white/5 border border-white/20 mb-4 flex flex-col items-center shadow-2xl">
                <span className="text-[11px] font-mono text-white/50 uppercase tracking-wider mb-1">
                  ROOM CODE
                </span>
                <div className="text-4xl font-mono font-black tracking-widest text-cyan-300 py-1 select-all">
                  {multiplayer.roomId || 'GENERATING...'}
                </div>

                <div className="flex items-center gap-2 mt-3 w-full">
                  <button
                    onClick={handleCopyCode}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 text-xs font-mono font-bold transition-all"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copied ? 'COPIED!' : 'COPY CODE'}</span>
                  </button>

                  <button
                    onClick={handleCopyLink}
                    className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 text-xs font-mono transition-all"
                    title="Copy Shareable Link"
                  >
                    <Share2 size={14} />
                    <span>LINK</span>
                  </button>
                </div>
              </div>

              {/* Waiting Status / Ready State */}
              <div className="w-full max-w-sm p-4 rounded-xl border mb-6 transition-all duration-300 bg-black/40 backdrop-blur-md">
                {!multiplayer.opponentJoined ? (
                  <div className="flex items-center justify-center gap-3 text-amber-400 font-mono text-xs">
                    <Loader2 size={16} className="animate-spin" />
                    <span>Waiting for Player 2 (Red Ship) to join...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3 text-emerald-400 font-mono text-xs font-bold">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>PLAYER 2 (RED SHIP) CONNECTED!</span>
                  </div>
                )}
              </div>

              {/* Start Match Button (Host only) */}
              <button
                id="host-start-match-btn"
                disabled={!multiplayer.opponentJoined}
                onClick={onStartOnlineGame}
                className={`w-full max-w-sm py-4 rounded-full font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl ${
                  multiplayer.opponentJoined
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:scale-105 active:scale-95 shadow-blue-500/30 cursor-pointer'
                    : 'bg-white/10 text-white/30 border border-white/10 cursor-not-allowed'
                }`}
              >
                <Play size={20} fill="currentColor" />
                <span>Launch Match</span>
              </button>
            </div>
          )}

          {/* Sub-view 3: Join Existing Room */}
          {onlineView === 'join' && (
            <div className="w-full flex flex-col items-center">
              <div className="px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-mono mb-3">
                YOU ARE JOINING AS • RED SHIP
              </div>

              <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight mb-2">
                Enter Room Code
              </h2>

              <p className="text-xs text-white/60 mb-5">
                Type the 6-character room code provided by the host.
              </p>

              {!(multiplayer.roomId && multiplayer.role === 'red') ? (
                <div className="w-full max-w-sm flex flex-col items-center gap-3 mb-4">
                  <div className="relative w-full">
                    <input
                      type="text"
                      maxLength={6}
                      autoFocus
                      value={inputRoomId}
                      onChange={(e) => {
                        setInputRoomId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                        setErrorMsg(null);
                      }}
                      placeholder="ENTER ROOM CODE"
                      className="w-full px-4 py-3.5 bg-white/10 border-2 border-white/20 focus:border-red-500 rounded-xl text-center text-2xl font-mono font-bold tracking-widest uppercase text-white outline-none placeholder:text-white/25 transition-colors"
                    />
                    {inputRoomId && (
                      <button
                        type="button"
                        onClick={() => {
                          setInputRoomId('');
                          setErrorMsg(null);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-white/40 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                        title="Clear code"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {errorMsg && (
                    <div className="flex items-center gap-1.5 text-xs text-red-400 font-mono">
                      <AlertCircle size={14} />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <button
                    id="submit-join-room-btn"
                    onClick={handleJoinRoom}
                    disabled={connecting || !inputRoomId.trim()}
                    className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold uppercase tracking-wider text-sm transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 cursor-pointer"
                  >
                    {connecting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Connecting...</span>
                      </>
                    ) : (
                      <>
                        <Users size={16} />
                        <span>Join Room</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="w-full max-w-sm p-6 rounded-2xl bg-white/5 border border-red-500/30 flex flex-col items-center shadow-xl">
                  <div className="text-xs font-mono text-red-400 font-bold mb-1">
                    ROOM: {multiplayer.roomId}
                  </div>
                  <div className="text-lg font-bold text-white mb-4">
                    Connected as Red Ship!
                  </div>

                  <div className="flex items-center gap-2.5 text-xs font-mono text-amber-300/90 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl">
                    <Loader2 size={14} className="animate-spin text-amber-400" />
                    <span>Waiting for Host to launch the battle...</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {errorMsg && onlineView !== 'join' && (
            <div className="mt-4 flex items-center gap-2 text-xs text-red-400 font-mono bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">
              <AlertCircle size={14} />
              <span>{errorMsg}</span>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};
