/** @type {import('next').NextConfig} */
const config = {
  // @aws-lite/client uses dynamic import(path) at runtime which Turbopack cannot statically analyze
  serverExternalPackages: ["@aws-lite/client", "@aws-lite/s3"],
};

export default config;
