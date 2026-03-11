import { useContext } from 'react';
import { WebAudioContext } from '../context/webaudio-context';

export function useWebAudio() {
    const context = useContext(WebAudioContext);
    return context;
}
