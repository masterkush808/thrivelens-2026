export type Presentation = 'male' | 'female';
export type MediaKind = 'animation' | 'hold';

export interface LibraryMedia {
  kind: MediaKind;
  poster: string;
  mp4: string | null;
  webp: string | null;
  resolution: number[];
  fps: number;
  frameCount: number;
  durationSeconds: number | null;
  professionalTechniqueReview: false;
}

export interface LibraryExercise {
  id: string;
  name: string;
  bodyPart: string;
  type: string;
  equipment: string;
  mechanics: string;
  level: string;
  description: string;
  illustrationSummary: string;
  demonstrationVariant: string;
  sideDemonstrated: string;
  media: Record<Presentation, LibraryMedia>;
}

export interface BundledMedia {
  kind: MediaKind;
  poster: number;
  video: number | null;
}
