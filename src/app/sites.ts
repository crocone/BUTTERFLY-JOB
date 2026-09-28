import { INTERVENTIONS } from '../data/interventions';
import { T, fmt } from '../data/text.en';
import { DELIVERY } from '../data/security';
import type { Era, Facts } from '../sim/types';

/** Where each inspectable site sits (grid tile, for camera focus and causal lines). */
export function siteTile(site: string, facts: Facts): { x: number; z: number; y: number } {
  switch (site) {
    case 'oak': {
      const loc = String(facts['oak.location']);
      if (loc === 'yard') return { x: 24.5, z: 5.5, y: 1.5 };
      if (loc === 'square') return { x: 15.5, z: 13.5, y: 1.5 };
      return { x: 25.5, z: 13.5, y: 1.5 };
    }
    case 'drain':
      return { x: 8.5, z: 19.5, y: 0.3 };
    case 'workshop':
      return { x: 8.9, z: 4.5, y: 1.2 };
    case 'cafe':
      return { x: 7.5, z: 12.5, y: 1.4 };
    case 'alley':
      return { x: 10, z: 6, y: 0.5 };
    case 'bankService':
      return { x: 12.5, z: 10.2, y: 0.8 };
    case 'garden':
      return { x: 25.5, z: 13.5, y: 0.4 };
    case 'bank':
      return { x: 16, z: 6, y: 2 };
    default:
      return { x: 15, z: 11, y: 0 };
  }
}

/** Interventions hosted by a site, by era. */
export function interventionAt(site: string, era: Era): string | null {
  const d = INTERVENTIONS.find((x) => x.site === site && x.era === era);
  return d ? d.id : null;
}

export function erasWithIntervention(site: string): Era[] {
  return INTERVENTIONS.filter((x) => x.site === site).map((x) => x.era);
}

/** Readable status lines for a site in an era (derived from the timeline facts). */
export function siteStatus(site: string, era: Era, f: Facts): string[] {
  const s = T.status;
  const out: string[] = [];
  const loc = String(f['oak.location']);
  switch (site) {
    case 'oak':
      out.push(s.oakAt[loc]);
      if (era >= 1986) {
        if (loc === 'garden') out.push(s.oakHeritage);
        else out.push(f['oak.preserved'] ? s.oakPreserved : s.oakPruned);
      }
      if (era === 2026) {
        if (f['oak.felled']) out.push(s.oakFelled);
        else if (f['oak.roofAccess']) out.push(s.oakRoof, s.roofCam);
      }
      break;
    case 'drain':
      out.push(f['drain.route'] === 'creek' ? s.drainCreek : s.drainStreet);
      if (era >= 1986 && f['drain.route'] === 'creek') out.push(f['drain.hatch'] ? s.hatch : s.noHatch);
      break;
    case 'workshop':
      out.push(f['alarm.feed'] === 'workshop' ? s.alarmWorkshop : s.alarmGrid);
      if (era >= 1986 && f['junction.box'] === 'westwing') out.push(s.boxWestwing);
      if (era >= 1986 && f['junction.box'] === 'alley') out.push(s.boxAlley);
      break;
    case 'cafe':
      if (era === 2026) out.push(f['cafe.state'] === 'open' ? s.cafeOpen : f['cafe.state'] === 'closed_flood' ? s.cafeFlood : s.cafeTerrace);
      if (era >= 1986 && f['cafe.valve']) out.push(s.valve);
      break;
    case 'alley':
      if (era >= 1986) out.push(f['alley.kept'] ? s.alleyOpen : s.alleyBuilt);
      if (era >= 1986 && f['bank.expansion'] === 'none') out.push(s.expansionNone);
      break;
    case 'bankService':
      if (era >= 1986) out.push(f['service.door'] === 'alley' ? s.serviceAlley : s.serviceFront);
      if (era === 2026) out.push(fmt(s.delivery, { period: DELIVERY.period, open: DELIVERY.insideTime }));
      break;
    case 'garden':
      if (era >= 1986) {
        if (!f['garden.exists']) out.push(s.gardenPaved);
        else if (f['garden.protected']) out.push(fmt(s.gardenProtected, { why: f['oak.location'] === 'garden' ? s.whyOak : s.whyPetition }));
        else out.push(s.gardenOpen);
      }
      break;
    default:
      break;
  }
  return out.filter(Boolean);
}
