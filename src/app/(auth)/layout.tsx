export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center"><div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-brand text-3xl font-bold text-brand-fg">$</div>
        <h1 className="text-2xl font-bold">Money</h1><p className="text-muted">Tus finanzas, en orden y en automático.</p></div>
      {children}
    </main>
  );
}
