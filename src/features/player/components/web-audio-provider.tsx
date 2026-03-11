import { useEffect, useState } from 'react';
import { WebAudioContext } from '@/features/player/context/webaudio-context';

export function WebAudioProvider({ children }: { children: React.ReactNode }) {
    const [webAudio, setWebAudio] = useState<{ context: AudioContext; gains: GainNode[] } | undefined>();

    useEffect(() => {
        if (typeof window !== 'undefined' && 'AudioContext' in window) {
            const context = new AudioContext({ latencyHint: 'playback' });
            const gains = [context.createGain(), context.createGain()];
            
            for (const gain of gains) {
                gain.connect(context.destination);
            }
            
            setWebAudio({ context, gains });
            
            console.log('[WebAudio] Context initialized');
        }
        
        return () => {
            if (webAudio?.context) {
                webAudio.context.close();
            }
        };
    }, []);

    return (
        <WebAudioContext.Provider value={{ webAudio }}>
            {children}
        </WebAudioContext.Provider>
    );
}
