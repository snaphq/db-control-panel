"use client";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { useForm } from "react-hook-form";

type FooterFormValues = {
  email: string;
};

export default function Footer() {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FooterFormValues>();

  const onSubmit = async (data: FooterFormValues) => {
    console.log(data);
    reset();
  };
  return (
    <footer className="border-t dark:bg-black">
      <div className="mx-auto max-w-[var(--breakpoint-xl)] px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-2">
          <div className="border-b   py-8 lg:order-last lg:border-b-0 lg:border-s lg:py-16 lg:ps-16">
            <div className="mt-8 space-y-4 lg:mt-0">
              <div>
                <h2 className="text-2xl font-medium">
                  Sign Up To Our Newsletter
                </h2>
                <p className="mt-4 max-w-lg  ">
                  Want the best SEO educational content from nerds who have fun
                  building and learning in the SEO space? If the answer is yes,
                  sign up.
                </p>
              </div>
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="flex flex-col border rounded-xl p-4 gap-3 mt-6 w-full"
              >
                <Input
                  {...register("email", { required: true })}
                  placeholder="Enter your email"
                  type="email"
                />
                <Button type="submit">Sign Up</Button>
              </form>
            </div>
          </div>

          <div className="py-8 lg:py-16 lg:pe-16">
            <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
              <div>
                <p className="font-medium ">Socials</p>

                <ul className="mt-6 space-y-4 text-sm">
                  <li>
                    <a
                      href="https://x.com/ak_ishere"
                      target="_blank"
                      className="transition hover:opacity-75"
                      rel="noreferrer"
                    >
                      {" "}
                      Twitter{" "}
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.youtube.com/@AIStackTeam"
                      target="_blank"
                      className="  transition hover:opacity-75"
                      rel="noreferrer"
                    >
                      {" "}
                      YouTube{" "}
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <p className="font-medium ">Helpful Links</p>

                <ul className="mt-6 space-y-4 text-sm">
                  <li>
                    <a
                      target="_blank"
                      href="/"
                      rel="noopener noreferrer"
                      className="  transition hover:opacity-75"
                    >
                      {" "}
                      Docs{" "}
                    </a>
                  </li>
                  <li>
                    <a href="/" className="  transition hover:opacity-75">
                      {" "}
                      Methodology{" "}
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 border-t   pt-8">
              <ul className="flex flex-wrap gap-4 text-xs">
                <li>
                  <a href="/terms" className="transition hover:opacity-75">
                    Terms & Conditions{" "}
                  </a>
                </li>

                <li>
                  <a href="/privacy" className="transition hover:opacity-75">
                    Privacy Policy{" "}
                  </a>
                </li>
              </ul>

              <p className="mt-8 text-xs  ">
                &copy; {new Date().getFullYear()}. SomeCompany LLC. All rights
                reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
