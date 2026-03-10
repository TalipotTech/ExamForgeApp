export default function ExamLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
