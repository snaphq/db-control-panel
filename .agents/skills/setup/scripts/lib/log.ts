import { colors } from "../../../../../scripts/lib/colors";

export function printHeader(text: string) {
  console.log("");
  console.log(`${colors.cyan}${"━".repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  ${text}${colors.reset}`);
  console.log(`${colors.cyan}${"━".repeat(60)}${colors.reset}`);
  console.log("");
}

export function printSuccess(text: string) {
  console.log(`  ${colors.green}✓${colors.reset} ${text}`);
}

export function printError(text: string) {
  console.log(`  ${colors.red}✗${colors.reset} ${text}`);
}

export function printWarning(text: string) {
  console.log(`  ${colors.yellow}⚠${colors.reset} ${text}`);
}

export function printInfo(text: string) {
  console.log(`  ${colors.blue}ℹ${colors.reset} ${text}`);
}

export function printStep(step: number, total: number, text: string) {
  console.log(`  ${colors.dim}[${step}/${total}]${colors.reset} ${text}`);
}
