import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DepartmentMultiSelect from './DepartmentMultiSelect';

const departments = [
  { dpt_id: '1', department_name: 'Accounting' },
  { dpt_id: '2', department_name: 'Civil Engineering' },
  { dpt_id: '3', department_name: 'Computer Science' },
];

const StatefulPicker = ({ initialIds = [], onChange }) => {
  const [selectedIds, setSelectedIds] = useState(initialIds);
  const updateSelection = (ids) => {
    setSelectedIds(ids);
    onChange(ids);
  };
  return (
    <DepartmentMultiSelect
      departments={departments}
      selectedIds={selectedIds}
      onChange={updateSelection}
    />
  );
};

test('searches and applies multiple department selections from the modal', () => {
  const onChange = jest.fn();
  render(<StatefulPicker onChange={onChange} />);

  fireEvent.click(screen.getByRole('button', { name: /choose departments/i }));
  expect(screen.getByText('0 departments selected')).toBeInTheDocument();

  fireEvent.change(screen.getByRole('searchbox', { name: /search departments/i }), {
    target: { value: 'computer' },
  });
  expect(screen.getByText('Computer Science')).toBeInTheDocument();
  expect(screen.queryByText('Accounting')).not.toBeInTheDocument();

  fireEvent.click(screen.getByLabelText('Computer Science'));
  expect(screen.getByText('1 department selected')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));

  expect(onChange).toHaveBeenCalledWith(['3']);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByText('1 selected')).toBeInTheDocument();
});

test('discards pending department changes when the modal is cancelled', () => {
  const onChange = jest.fn();
  render(<StatefulPicker initialIds={['1']} onChange={onChange} />);

  fireEvent.click(screen.getByRole('button', { name: /change departments/i }));
  fireEvent.click(screen.getByLabelText('Civil Engineering'));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText('1 selected')).toBeInTheDocument();
});
