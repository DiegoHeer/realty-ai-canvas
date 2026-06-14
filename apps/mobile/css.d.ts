// Allow side-effect and module CSS imports (global.css, *.module.css, the
// maplibre-gl stylesheet) to typecheck. Metro/Expo handle the actual bundling.
declare module '*.css';

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
