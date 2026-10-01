import type React from "react";
import Footer from "../LandingPage/Footer";
import { NavBar } from "../NavBar";

export default function PageWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <NavBar />
      <main className="page-wrapper-pattern flex w-full flex-col items-center justify-between bg-white dark:bg-black">
        <div className="absolute z-[-99] pointer-events-none inset-0 flex items-center justify-center [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />
        {children}
      </main>
      <Footer />
    </>
  );
}
