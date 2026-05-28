declare module 'amplitudejs' {
  export interface AmplitudeSong {
    name: string;
    artist?: string;
    album?: string;
    url: string;
    cover_art_url?: string;
  }

  export interface AmplitudePlaylist {
    songs: AmplitudeSong[];
  }

  export interface AmplitudeConfig {
    songs: AmplitudeSong[];
    playlists?: Record<string, AmplitudePlaylist>;
    preload?: 'auto' | 'metadata' | 'none';
    starting_playlist?: string;
    starting_playlist_song?: number;
  }

  export interface AmplitudeApi {
    bindNewElements(): void;
    getAudio(): HTMLAudioElement;
    init(config: AmplitudeConfig): void;
    pause(): void;
  }

  const Amplitude: AmplitudeApi;

  export default Amplitude;
}
