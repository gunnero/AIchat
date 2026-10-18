// Deliberately small renderer: model output is text, never executable HTML.
export function MessageText({ content }: { content: string }) {
  return (
    <div className="message-text">
      {content
        .split("\n\n")
        .map((block, index) =>
          block.startsWith("## ") ? (
            <h2 key={index}>{block.slice(3)}</h2>
          ) : (
            <p key={index}>{block}</p>
          ),
        )}
    </div>
  );
}
