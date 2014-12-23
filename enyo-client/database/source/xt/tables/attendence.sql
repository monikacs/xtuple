select xt.create_table('attendence');
select xt.add_column('attendence','emlprofile_id', 'serial');
select xt.add_column('attendence','emlprofile_name', 'text', 'not null');
select xt.add_column('attendence','emlprofile_present', 'date', 'not null');
