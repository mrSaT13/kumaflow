import { useEffect, useRef } from 'react';
import { useWebAudio } from '@/features/player/hooks/use-webaudio';
import { usePlayerRef } from '@/store/player.store';
import { Button } from '@/app/components/ui/button';
import { RotateCcw, RotateCw } from 'lucide-react';

export interface VisualizerSettings {
    gradient?: string;
    mode?: number;
    fftSize?: number;
    smoothing?: number;
    minFreq?: number;
    maxFreq?: number;
    minDecibels?: number;
    maxDecibels?: number;
    radial?: boolean;
    mirror?: number;
    ledBars?: boolean;
    showPeaks?: boolean;
}

const defaultSettings: VisualizerSettings = {
    gradient: 'prism',
    mode: 10,
    fftSize: 8192,
    smoothing: 0.7,
    minFreq: 20,
    maxFreq: 22050,
    minDecibels: -85,
    maxDecibels: -25,
    radial: false,
    mirror: 0,
    ledBars: false,
    showPeaks: true,
};

export const Visualizer = ({ settings = defaultSettings }: { settings?: VisualizerSettings }) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const motionRef = useRef<any>(null);
    const { webAudio } = useWebAudio();
    const audioRef = usePlayerRef();
    const settingsRef = useRef(settings);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    const handleSeekAction = (value: number) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime += value;
    };

    useEffect(() => {
        if (!canvasRef.current || !webAudio) return;

        let audioMotion: any;
        let isMounted = true;

        const initVisualizer = async () => {
            try {
                const module = await import('audiomotion-analyzer');
                const AudioMotionAnalyzer = module.default;

                const opts = {
                    ...settingsRef.current,
                    audioCtx: webAudio.context,
                };

                audioMotion = new AudioMotionAnalyzer(canvasRef.current, opts);

                // Подключаем к GainNode
                for (const gain of webAudio.gains) {
                    audioMotion.connectInput(gain);
                }

                if (isMounted) {
                    motionRef.current = audioMotion;
                }
            } catch (error) {
                console.error('[Visualizer] Failed to initialize:', error);
            }
        };

        initVisualizer();

        return () => {
            isMounted = false;
            if (audioMotion) {
                audioMotion.destroy();
            }
        };
    }, [webAudio]);

    return (
        <div className="relative w-full h-full bg-black">
            {/* Кнопки управления */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex gap-2">
                <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => handleSeekAction(-15)}
                    title="Назад на 15 секунд"
                    className="bg-black/50 hover:bg-black/70"
                >
                    <span className="absolute text-[8px] font-light -top-0.5 -left-0.5 text-white">
                        15
                    </span>
                    <RotateCcw className="w-5 h-5 text-white" />
                </Button>
                <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => handleSeekAction(30)}
                    title="Вперёд на 30 секунд"
                    className="bg-black/50 hover:bg-black/70"
                >
                    <span className="absolute text-[8px] font-light -top-0.5 -right-0.5 text-white">
                        30
                    </span>
                    <RotateCw className="w-5 h-5 text-white" />
                </Button>
            </div>
            
            <div
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    background: '#000',
                }}
            />
        </div>
    );
};
