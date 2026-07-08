import { Header } from './components/Header';
import { Ticker } from './components/Ticker';
import { Hero } from './components/Hero';
import { StatsStrip } from './components/StatsStrip';
import { Pipeline } from './components/Pipeline';
import { DeveloperTools } from './components/DeveloperTools';
import { Outcomes } from './components/Outcomes';
import { Integrations } from './components/Integrations';
import { UseCases } from './components/UseCases';
import { Cta } from './components/Cta';
import { Footer } from './components/Footer';
import { Reveal } from './components/Reveal';

function App() {
  return (
    <div className="page">
      <Header />
      <Ticker />

      <main>
        <Hero />
        <StatsStrip />

        <Reveal>
          <Pipeline />
        </Reveal>

        <Reveal delay={80}>
          <DeveloperTools />
        </Reveal>

        <Reveal delay={80}>
          <Outcomes />
        </Reveal>

        <Reveal delay={80}>
          <Integrations />
        </Reveal>

        <Reveal delay={80}>
          <UseCases />
        </Reveal>

        <Reveal delay={80}>
          <Cta />
        </Reveal>
      </main>

      <Footer />
    </div>
  );
}

export default App;
