import type { WebMapProps } from "@/components/maps/WebMap";

interface GoogleMapProps extends WebMapProps {
  apiKey: string;
  onError: () => void;
}

export function GoogleMap(_props: GoogleMapProps) {
  return null;
}
