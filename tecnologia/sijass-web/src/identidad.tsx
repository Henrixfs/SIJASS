import { BookOpen, ClipboardList, Droplet, FlaskConical, LayoutGrid, Landmark, Megaphone, Mountain, UserCog, UserRound, UsersRound, Wallet } from 'lucide-react';

const iconos = {
  inicio: LayoutGrid, asociados: UsersRound, equipo: UserCog, cuotas: Wallet, reservorios: Landmark,
  mediciones: FlaskConical, campo: ClipboardList, asistente: BookOpen, perfil: UserRound, reportes: Megaphone,
};

export function IconoModulo({ id }: { id: string }) {
  const Icono = Object.hasOwn(iconos, id) ? iconos[id as keyof typeof iconos] : Mountain;
  return <Icono aria-hidden="true" size={21} strokeWidth={1.7} />;
}

export function Marca() {
  return <strong className="marca"><span className="marca-gota"><Droplet aria-hidden="true" size={24} /></span>SIJASS</strong>;
}
