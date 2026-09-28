pipeline {
    agent any

    environment {
        // Define environment variables here
        IMAGE_NAME = "dpp-student-portal"
    }

    stages {
        stage('Checkout') {
            steps {
                // Check out the code from the GitHub repository
                checkout scm
                echo 'Code checked out successfully.'
            }
        }

        stage('Build Docker Image') {
            steps {
                // Build the Docker image using the Dockerfile
                echo 'Building Docker image...'
                script {
                    // For Windows agents using PowerShell, use bat or powershell
                    bat 'docker build -t %IMAGE_NAME%:latest .'
                }
            }
        }

        stage('Test Application') {
            steps {
                // Run the basic Node.js tests
                echo 'Running unit tests...'
                bat 'npm install'
                bat 'npm test'
            }
        }

        stage('Deploy with Docker Compose') {
            steps {
                // Bring down existing containers and spin up the new ones
                echo 'Deploying application stack...'
                bat 'docker-compose down'
                bat 'docker-compose up -d --build'
            }
        }
    }

    post {
        success {
            echo 'Pipeline completed successfully! Application is running.'
        }
        failure {
            echo 'Pipeline failed! Please check the logs.'
        }
    }
}
