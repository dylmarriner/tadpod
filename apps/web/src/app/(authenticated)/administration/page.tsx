import { Card } from '@tadpods/ui';

export const metadata = { title: 'Administration' };

type AdministrationSection = {
  title: string;
  description: string;
  href: string;
};

const sections: readonly AdministrationSection[] = [
  {
    title: 'Branding',
    description: 'Configure the TADPODS name, colours, logo and document footer.',
    href: '/administration/branding'
  },
  {
    title: 'Users',
    description: 'Create staff accounts and assign operational roles.',
    href: '/administration/users'
  },
  {
    title: 'Roles and permissions',
    description: 'Control exactly what each role can see and change.',
    href: '/administration/roles'
  },
  {
    title: 'Audit history',
    description: 'Trace authentication and configuration changes.',
    href: '/administration/audit'
  }
];

export default function AdministrationPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Administration</h1>
          <p>Configure access and TADPODS presentation.</p>
        </div>
      </header>
      <div className="grid grid--2">
        {sections.map((section) => (
          <a key={section.href} href={section.href}>
            <Card title={section.title}>
              <p>{section.description}</p>
            </Card>
          </a>
        ))}
      </div>
    </>
  );
}
