import { createContext } from 'react';

export type WebAudio = {
    context: AudioContext;
    gains: GainNode[];
};

export const WebAudioContext = createContext<{
    setWebAudio?: (audio: WebAudio) => void;
    webAudio?: WebAudio;
}>({});
