import PageWrapper from "@/components/Container/PageWrapper";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Nextjs 16 Starter Template",
  description: "Privacy Policy for Nextjs 16 Starter Template",
};

export default function PrivacyPage() {
  return (
    <PageWrapper>
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="prose prose-lg dark:prose-invert max-w-none">
          <h1 className="scroll-m-20 text-4xl font-semibold tracking-tight mb-8">
            Privacy Policy
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
              1. Introduction
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We respect your privacy and are committed to protecting your
              personal data. This privacy policy explains how we collect, use,
              and safeguard your information when you use our service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              2. Information We Collect
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We collect information that you provide directly to us, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>Account information (name, email address, password)</li>
              <li>Profile information you choose to provide</li>
              <li>
                Payment information (processed securely through third-party
                payment processors)
              </li>
              <li>Communications with us (support requests, feedback)</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 mb-4 mt-4">
              We also automatically collect certain information when you use our
              service:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>Usage data and analytics</li>
              <li>Device information and IP address</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              3. How We Use Your Information
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We use the information we collect to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>Provide, maintain, and improve our service</li>
              <li>Process transactions and send related information</li>
              <li>Send you technical notices and support messages</li>
              <li>Respond to your comments and questions</li>
              <li>Monitor and analyze trends and usage</li>
              <li>Detect, prevent, and address technical issues</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              4. Data Sharing and Disclosure
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We do not sell your personal information. We may share your
              information only in the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>
                With service providers who assist us in operating our service
              </li>
              <li>When required by law or to protect our rights</li>
              <li>In connection with a business transfer or merger</li>
              <li>With your consent or at your direction</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              5. Data Security
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We implement appropriate technical and organizational measures to
              protect your personal data against unauthorized access,
              alteration, disclosure, or destruction. However, no method of
              transmission over the Internet or electronic storage is 100%
              secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              6. Cookies and Tracking Technologies
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We use cookies and similar tracking technologies to track activity
              on our service and hold certain information. You can instruct your
              browser to refuse all cookies or to indicate when a cookie is
              being sent. However, if you do not accept cookies, you may not be
              able to use some portions of our service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              7. Your Rights
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Depending on your location, you may have certain rights regarding
              your personal data, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>The right to access your personal data</li>
              <li>The right to rectify inaccurate data</li>
              <li>The right to request deletion of your data</li>
              <li>The right to object to processing of your data</li>
              <li>The right to data portability</li>
              <li>The right to withdraw consent</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 mb-4 mt-4">
              To exercise these rights, please contact us through our support
              channels.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              8. Data Retention
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We retain your personal data only for as long as necessary to
              fulfill the purposes outlined in this privacy policy, unless a
              longer retention period is required or permitted by law. When we
              no longer need your data, we will securely delete or anonymize it.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              9. Children&apos;s Privacy
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Our service is not intended for children under the age of 13. We
              do not knowingly collect personal information from children under
              13. If you are a parent or guardian and believe your child has
              provided us with personal information, please contact us
              immediately.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              10. International Data Transfers
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Your information may be transferred to and maintained on computers
              located outside of your state, province, country, or other
              governmental jurisdiction where data protection laws may differ.
              By using our service, you consent to the transfer of your
              information to our facilities and those third parties with whom we
              share it as described in this policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              11. Changes to This Privacy Policy
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We may update our privacy policy from time to time. We will notify
              you of any changes by posting the new privacy policy on this page
              and updating the &quot;Last updated&quot; date. You are advised to
              review this privacy policy periodically for any changes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4">
              12. Contact Us
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              If you have any questions about this privacy policy or our data
              practices, please contact us through our support channels.
            </p>
          </section>
        </div>
      </div>
    </PageWrapper>
  );
}
