declare module 'amplitudejs' {
  export interface AmplitudeSong {
    name: string;
    artist?: string;
    url: string;
  }

  export interface AmplitudeConfig {
    preload?: string;
    songs: AmplitudeSong[];
  }

  interface AmplitudeStatic {
    init(config: AmplitudeConfig): void;
    getAudio(): HTMLAudioElement;
  }

  const Amplitude: AmplitudeStatic;

  export default Amplitude;
}
