-- Create dedicated test database for LeetRoot integration testing if it does not already exist
SELECT 'CREATE DATABASE leetroot_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'leetroot_test')\gexec