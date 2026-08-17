import { useEffect, useState } from "react";

type HealthState = "checking" | "online" | "offline";

export function App() {
  const [health, setHealth] = useState<HealthState>("checking");

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Health request failed: ${response.status}`);
        }
        return response.json() as Promise<{ status: string }>;
      })
      .then((body) => setHealth(body.status === "ok" ? "online" : "offline"))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setHealth("offline");
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="shell">
      <section className="card">
        <p className="eyebrow">Stage 1 bootstrap</p>
        <h1>GraphNotes</h1>
        <p className="summary">
          The application skeleton is running. Product features arrive in later
          stages.
        </p>
        <div className={`status status--${health}`} role="status">
          <span className="status__dot" aria-hidden="true" />
          Backend: {health}
        </div>
      </section>
    </main>
  );
}
