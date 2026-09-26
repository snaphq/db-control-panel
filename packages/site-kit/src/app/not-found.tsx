import { ErrorScreen } from "@repo/react-ui/components/errors/error-screen";

export default function NotFound() {
  return <ErrorScreen code="404" title="This page could not be found." />;
}
