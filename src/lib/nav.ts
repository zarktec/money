import {
  Home, ArrowLeftRight, PiggyBank, Wallet, CalendarDays, Landmark, FolderKanban, TrendingUp, HeartPulse, Scale, Sparkles,
  ScanLine, Mail, Users, BadgeCheck, Database, KeyRound, Repeat, Tags, Receipt, PieChart, Shield, type LucideIcon,
} from "lucide-react";

export interface NavItem { href: string; label: string; hint?: string; Icon: LucideIcon }
export interface NavGroup { title: string; items: NavItem[] }

/** Un solo mapa de la app para el menú lateral del escritorio y la pantalla «Más» del celular. */
export const NAV_GROUPS: NavGroup[] = [
  { title: "Principal", items: [
    { href: "/inicio", label: "Inicio", hint: "Tu mes de un vistazo", Icon: Home },
    { href: "/movimientos", label: "Movimientos", hint: "Ingresos y egresos", Icon: ArrowLeftRight },
  ] },
  { title: "Dinero", items: [
    { href: "/cuentas", label: "Cuentas", hint: "Saldos", Icon: Wallet },
    { href: "/presupuestos", label: "Presupuestos", hint: "Límites por categoría", Icon: PieChart },
    { href: "/recurrentes", label: "Fijos y recurrentes", hint: "Pagos y cobros periódicos", Icon: Repeat },
    { href: "/suscripciones", label: "Suscripciones", hint: "Detectadas en tus gastos", Icon: Receipt },
    { href: "/categorias", label: "Categorías", hint: "Organiza tus gastos", Icon: Tags },
  ] },
  { title: "Planificación", items: [
    { href: "/ahorros", label: "Ahorros", hint: "Metas con fecha", Icon: PiggyBank },
    { href: "/deudas", label: "Deudas", hint: "Cuotas y saldos", Icon: Landmark },
    { href: "/proyectos", label: "Proyectos", hint: "Presupuesto por proyecto", Icon: FolderKanban },
    { href: "/calendario", label: "Calendario", hint: "Próximos vencimientos", Icon: CalendarDays },
    { href: "/proyeccion", label: "Proyección de caja", hint: "Cómo viene el mes", Icon: TrendingUp },
  ] },
  { title: "Análisis", items: [
    { href: "/salud", label: "Salud financiera", hint: "Tu puntaje y consejos", Icon: HeartPulse },
    { href: "/patrimonio", label: "Patrimonio", hint: "Lo que tienes y lo que debes", Icon: Scale },
    { href: "/asistente", label: "Asistente", hint: "Pregúntale a tus datos", Icon: Sparkles },
  ] },
  { title: "Herramientas", items: [
    { href: "/importar", label: "Importar y escanear", hint: "Extractos y recibos", Icon: ScanLine },
    { href: "/correo", label: "Correo", hint: "Lee tus notificaciones", Icon: Mail },
    { href: "/compartidos", label: "Gastos compartidos", hint: "Divide con otros", Icon: Users },
  ] },
  { title: "Mi cuenta", items: [
    { href: "/cuenta/suscripcion", label: "Mi plan", hint: "Suscripción y pagos", Icon: BadgeCheck },
    { href: "/cuenta/datos", label: "Mis datos", hint: "Exportar o eliminar", Icon: Database },
    { href: "/cuenta/clave", label: "Contraseña", hint: "Cambiar contraseña", Icon: KeyRound },
  ] },
];

export const ADMIN_ITEM: NavItem = { href: "/admin", label: "Administración", hint: "Planes, usuarios y catálogos", Icon: Shield };
