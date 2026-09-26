import PageWrapper from "@/components/Container/PageWrapper";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions | Nextjs 16 Starter Template",
  description: "Terms and Conditions for Nextjs 16 Starter Template",
};

export default function TermsPage() {
  return (
    <PageWrapper>
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="prose prose-lg dark:prose-invert max-w-none">
          <h1 className="scroll-m-20 text-4xl font-semibold tracking-tight mb-8">
            Terms & Conditions
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            Last updated:{" "}
            {new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              By accessing and using this service, you accept and agree to be
              bound by the terms and provision of this agreement. If you do not
              agree to abide by the above, please do not use this service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              2. Use License
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Permission is granted to temporarily access the materials on our
              service for personal, non-commercial transitory viewing only. This
              is the grant of a license, not a transfer of title, and under this
              license you may not:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>Modify or copy the materials</li>
              <li>
                Use the materials for any commercial purpose or for any public
                display
              </li>
              <li>
                Attempt to reverse engineer any software contained on the
                service
              </li>
              <li>
                Remove any copyright or other proprietary notations from the
                materials
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              3. Service Description
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We provide a software-as-a-service platform that enables users to
              build and manage their applications. We reserve the right to
              modify, suspend, or discontinue any part of the service at any
              time with or without notice.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              4. User Accounts
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              You are responsible for maintaining the confidentiality of your
              account and password. You agree to accept responsibility for all
              activities that occur under your account or password. You must
              notify us immediately of any unauthorized use of your account.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              5. Payment Terms
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              If you purchase a subscription, you agree to pay the fees
              specified at the time of purchase. All fees are non-refundable
              except as required by law. We reserve the right to change our
              pricing with 30 days notice to existing customers.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              6. Prohibited Uses
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              You may not use our service:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>
                In any way that violates any applicable national or
                international law or regulation
              </li>
              <li>
                To transmit, or procure the sending of, any advertising or
                promotional material
              </li>
              <li>
                To impersonate or attempt to impersonate the company, a company
                employee, another user, or any other person or entity
              </li>
              <li>
                In any way that infringes upon the rights of others, or in any
                way is illegal, threatening, fraudulent, or harmful
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              7. Intellectual Property
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              The service and its original content, features, and functionality
              are and will remain the exclusive property of the company and its
              licensors. The service is protected by copyright, trademark, and
              other laws.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              8. Disclaimer
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              The materials on our service are provided on an &apos;as is&apos;
              basis. We make no warranties, expressed or implied, and hereby
              disclaim and negate all other warranties including, without
              limitation, implied warranties or conditions of merchantability,
              fitness for a particular purpose, or non-infringement of
              intellectual property or other violation of rights.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              9. Limitation of Liability
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              In no event shall the company or its suppliers be liable for any
              damages (including, without limitation, damages for loss of data
              or profit, or due to business interruption) arising out of the use
              or inability to use the materials on our service, even if we or an
              authorized representative has been notified orally or in writing
              of the possibility of such damage.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              10. Revisions
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We may revise these terms of service at any time without notice.
              By using this service you are agreeing to be bound by the then
              current version of these terms of service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              11. Contact Information
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              If you have any questions about these Terms & Conditions, please
              contact us through our support channels.
            </p>
          </section>
        </div>
      </div>
    </PageWrapper>
  );
}
