import { Card } from '@tadpods/ui';

export const metadata = { title: 'Administration' };

export default function AdministrationPage() {
  const sections = [
    ['Branding', 'Configure the TADPODS name, colours, logo and document footer.', '/administration/branding'],
    ['Users', 'Create staff accounts and assign operational roles.', '/administration/users'],
    ['Roles and permissions', 'Control exactly what each role can see and change.', '/administration/roles'],
    ['Audit history', 'Trace authentication and configuration changes.', '/administration/audit']
  ];
  return <><header className="page-header"><div><h1>Administration</h1><p>Configure access and TADPODS presentation.</p></div></header><div className="grid grid--2">{sections.map(([title, description, href]) => <a key={title} href={href}><Card title={title}><p>{description}</p></Card></a>)}</div></>;
}
