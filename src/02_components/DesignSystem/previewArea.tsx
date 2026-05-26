import { Button } from '../02_molecules/Button/Button';
import { Dropdown } from '../02_molecules/Dropdown/Dropdown.view';
import { Counter } from '../02_molecules/Counter/Counter.view';
import { Frame } from '../01_atoms/Frame/Frame';
import { Text } from '../01_atoms/Text/Text';
import { COMPONENT_LIBRARY } from './constants';

interface PreviewAreaProps {
	activeComponent: string;
	onActiveComponentChange: (value: string) => void;
}

const COMPONENT_OPTIONS = COMPONENT_LIBRARY.map((component) => ({
	value: component.value,
	label: component.label,
}));

export function PreviewArea({ activeComponent, onActiveComponentChange }: PreviewAreaProps) {
	const preview = (() => {
		switch (activeComponent) {
			case 'Frame':
				return (
					<Frame layout="grid" className="grid gap-3 md:grid-cols-2">
						<Frame variant="surface" padding={18} layout="flex" direction="column" gap={8}>
							<Text variant="small" color="text-2" transform="uppercase" tracking="widest">
								Surface
							</Text>
							<Text variant="p">Shared frame container.</Text>
						</Frame>
						<Frame variant="surface" padding={18} layout="flex" direction="column" gap={8}>
							<Text variant="small" color="text-2" transform="uppercase" tracking="widest">
								Nested Frame
							</Text>
							<Text variant="p">Used for layout stacks and panel composition.</Text>
						</Frame>
					</Frame>
				);
			case 'Button':
				return (
					<Frame layout="flex" wrap="wrap" gap={10}>
						<Button variant="primary">Primary</Button>
						<Button variant="secondary">Secondary</Button>
						<Button variant="outline">Outline</Button>
						<Button variant="ghost">Ghost</Button>
					</Frame>
				);
			case 'Dropdown':
				return (
					<Dropdown
						options={COMPONENT_OPTIONS}
						value={activeComponent}
						onChange={onActiveComponentChange}
						label="Component"
					/>
				);
			case 'Counter':
				return <Counter initialValue={3} maxWidth={360} />;
			case 'Text':
				return (
					<Frame layout="flex" direction="column" gap={10}>
						<Text variant="h2" weight="black">Heading H2</Text>
						<Text variant="h4" weight="bold">Heading H4</Text>
						<Text variant="p">Body copy demonstrates the shared neutral type scale.</Text>
						<Text variant="xs" color="text-2">Utility label text.</Text>
					</Frame>
				);
			case 'Header':
				return (
					<Frame variant="surface" padding={18} layout="flex" align="center" justify="between" gap={12}>
						<Frame layout="flex" direction="column">
							<Text variant="small" color="text-2" transform="uppercase" tracking="widest" className="font-brand">Sleipnir</Text>
							<Text variant="h6" weight="bold" className="uppercase tracking-[0.12em]">Header</Text>
						</Frame>
						<Button variant="outline" size="sm">Action</Button>
					</Frame>
				);
			case 'Footer':
				return (
					<Frame variant="surface" padding={18} layout="flex" align="center" justify="between">
						<Text variant="xs" color="text-2" className="tracking-[0.18em]">STATUS_OK</Text>
						<Text variant="xs" color="text-2" className="tracking-[0.18em]">HOUSEPLANT</Text>
					</Frame>
				);
			default:
				return null;
		}
	})();

	return (
		<Frame variant="surface" padding={18} layout="flex" direction="column" gap={12} className="basis-1/3 shrink-0 border-b border-[var(--border-1)]">
			<Text variant="small" color="text-2" transform="uppercase" tracking="widest">
				Preview
			</Text>
			<Frame
				variant="none"
				padding={16}
				layout="flex"
				align="center"
				justify="center"
				border="1px solid var(--border-1)"
				backgroundColor="var(--primary-7)"
				className="h-full"
			>
				{preview}
			</Frame>
		</Frame>
	);
}