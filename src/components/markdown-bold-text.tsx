export function MarkdownBoldText({
  content,
  strongClassName = "font-semibold",
}: {
  content: string;
  strongClassName?: string;
}) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        const bold = /^\*\*(.+)\*\*$/.exec(part);
        if (bold) {
          return (
            <strong key={index} className={strongClassName}>
              {bold[1]}
            </strong>
          );
        }
        return part;
      })}
    </>
  );
}
