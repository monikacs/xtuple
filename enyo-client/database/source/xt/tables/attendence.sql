--attendence tracking

select xt.create_table('attendence');
select xt.add_column('attendence','emlprofile_id','serial','primary key');
select xt.add_column('attendence','emlprofile_date','date','not null');
select xt.add_column('attendence','emlprofile_present','text','not null');
