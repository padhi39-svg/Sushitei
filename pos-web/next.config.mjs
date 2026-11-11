/** @type {import('next').NextConfig} */
const nextConfig = {
  // SQL Server 2005 via tedious - jangan strict mode aneh-aneh di dev
  reactStrictMode: false,
};
export default nextConfig;
