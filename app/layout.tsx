import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  const title = "RAGGIÒ — L’assistente della ciclofficina";
  const description = "Assistente Bike4City per capire con prudenza i piccoli problemi della bicicletta.";
  return {
    title, description,
    openGraph: { title, description, locale:"it_IT", type:"website", images:[{url:image,width:1200,height:630,alt:"Raggiò, assistente Bike4City"}] },
    twitter: { card:"summary_large_image", title, description, images:[image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body>{children}</body></html>;
}
