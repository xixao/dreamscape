import SharedReview from "./shared-review";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedReview token={token} />;
}
