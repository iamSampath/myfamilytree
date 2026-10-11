/** Static export: the app is fully client-side (Firebase Auth + Firestore),
 *  so it can be hosted on Vercel, Firebase Hosting or any static host. */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
};
export default nextConfig;
