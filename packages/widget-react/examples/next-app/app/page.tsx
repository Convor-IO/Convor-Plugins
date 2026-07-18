import {useConvor} from "@convor/widget-react";

/**
 * Minimal landing page. Shows how a child component can trigger the chat
 * programmatically via {@link useConvor}.
 */
export default function HomePage() {
  const convor = useConvor();
  return (
    <main style={{fontFamily: "system-ui", padding: "2rem"}}>
      <h1>Convor + Next.js</h1>
      <p>The chat bubble should appear in the bottom-right corner.</p>
      <button type="button" onClick={() => convor?.openChat()}>
        Open chat
      </button>
    </main>
  );
}
