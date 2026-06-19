import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { RoomCombobox } from './RoomCombobox';
import { ROOM_OPTIONS } from '@/lib/rooms';

function Wrapper({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <RoomCombobox value={value} onChange={setValue} />;
}

it('TC-RC-1: renders input with current value', () => {
  render(<Wrapper initial="MBTMY THE VISTA" />);
  expect(screen.getByRole('combobox')).toHaveValue('MBTMY THE VISTA');
});

it('TC-RC-2: typing filters the dropdown options (case-insensitive)', async () => {
  const user = userEvent.setup();
  render(<Wrapper />);
  const input = screen.getByRole('combobox');

  await user.click(input);
  await user.type(input, 'bridge');

  const listbox = screen.getByRole('listbox');
  const options = listbox.querySelectorAll('li');
  expect(options).toHaveLength(1);
  expect(screen.getByText('MBTMY THE BRIDGE')).toBeInTheDocument();
});

it('TC-RC-3: clicking an option sets the value and closes dropdown', async () => {
  const user = userEvent.setup();
  render(<Wrapper />);
  const input = screen.getByRole('combobox');

  await user.click(input);
  expect(screen.getByRole('listbox')).toBeInTheDocument();

  await user.click(screen.getByText('MBTMY THE FOREST'));
  expect(input).toHaveValue('MBTMY THE FOREST');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('TC-RC-4: custom text entry works (not limited to predefined list)', async () => {
  const user = userEvent.setup();
  render(<Wrapper />);
  const input = screen.getByRole('combobox');

  await user.type(input, 'custom-room@example.com');
  expect(input).toHaveValue('custom-room@example.com');
});

it('TC-RC-5: empty search shows all 14 options', async () => {
  const user = userEvent.setup();
  render(<Wrapper />);
  const input = screen.getByRole('combobox');

  await user.click(input);

  const listbox = screen.getByRole('listbox');
  const options = listbox.querySelectorAll('li');
  expect(options).toHaveLength(ROOM_OPTIONS.length);
});
