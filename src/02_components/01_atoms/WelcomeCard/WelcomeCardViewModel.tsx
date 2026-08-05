import { WelcomeCardProps } from './iWelcomeCard';

// This is a deliberately tiny example — the View/ViewModel/Interface split
// still applies even to a component this small: the ViewModel resolves
// props/defaults and any derived values, the View only renders what it's
// handed back.
export function useWelcomeCardViewModel({ title, subtitle }: WelcomeCardProps) {
  return {
    title: title ?? 'Welcome to Sleipnir',
    subtitle: subtitle ?? 'This card is a real, scaffolded component — open it in the Component Library to see how it works.',
  };
}
