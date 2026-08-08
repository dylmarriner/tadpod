import { Card, PageHeader } from '@tadpods/ui';

export const metadata = { title: 'Administration' };

type AdministrationSection = {
  code: string;
  title: string;
  description: string;
  href: string;
};

const sections: readonly AdministrationSection[] = [
  {
    code: 'BR',
    title: 'Branding',
    description: 'Configure the TADPODS name, customer-facing branding and document footer.',
    href: '/administration/branding'
  },
  {
    code: 'US',
    title: 'Users',
    description: 'Create staff accounts and assign operational roles.',
    href: '/administration/users'
  },
  {
    code: 'RL',
    title: 'Roles and permissions',
    description: 'Control exactly what each role can see and change.',
    href: '/administration/roles'
  },
  {
    code: 'AU',
    title: 'Audit history',
    description: 'Trace authentication, configuration and security changes.',
    href: '/administration/audit'
  }
];

export default function AdministrationPage() {
  return <>
    <PageHeader kicker="System" title="Administration" description="Configure access, presentation and audit controls for TADPODS." />
    <div className="grid grid--2">
      {sections.map((section) => <a key={section.href} href={section.href}>
        <Card kicker={section.code} title={section.title}>
          <p className="muted" style={{ margin: 0 }}>{section.description}</p>
        </Card>
      </a>)}
    </div>
  </>;
}
