import { Montserrat } from "next/font/google";

/**
 * Stessa famiglia del Size of Prize: Montserrat variable su Google Fonts.
 * Solo P0, cosi' il resto del lab resta su Geist.
 */
const montserrat = Montserrat({
  subsets: ["latin"],
  display: "block",
  weight: "variable",
});

export default function P0Layout({ children }: LayoutProps<"/p0">) {
  return <div className={`${montserrat.className} h-full`}>{children}</div>;
}
