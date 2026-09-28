
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Feather Icons
  if (window.feather) {
    feather.replace();
  }

  // Form & Layout References
  const form = document.getElementById('registrationForm');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');
  const themeText = document.getElementById('themeText');
  const htmlElement = document.documentElement;

  // Form Input References
  const nameInput = document.getElementById('name');
  const mobileInput = document.getElementById('mobile');
  const emailInput = document.getElementById('email');
  const branchInput = document.getElementById('branch');
  const passwordInput = document.getElementById('password');

  // Password Requirement Widgets
  const reqMinLength = document.getElementById('reqMinLength');
  const reqUppercase = document.getElementById('reqUppercase');
  const reqLowercase = document.getElementById('reqLowercase');
  const reqNumber = document.getElementById('reqNumber');
  const strengthBar = document.getElementById('strengthBar');
  const strengthText = document.getElementById('strengthText');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const passwordEyeIcon = document.getElementById('passwordEyeIcon');

  // Student Directory Table References
  const studentsTableBody = document.getElementById('studentsTableBody');
  const studentCountBadge = document.getElementById('studentCount');

  // Modal References
  const successModal = document.getElementById('successModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalDescription = document.getElementById('modalDescription');

  // In-memory student array initialized dynamically
  let registeredStudents = [];
  async function loadInitialStudents() {
    try {
      const response = await fetch('/api/students');
      if (response.ok) {
        registeredStudents = await response.json();
      } else {
        registeredStudents = [];
      }
    } catch (err) {
      registeredStudents = [];
    }
    renderStudentsTable();
  }

  function renderStudentsTable() {
    studentsTableBody.innerHTML = '';
    registeredStudents.forEach(stu => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${stu.id}</strong></td>
        <td>${escapeHtml(stu.name)}</td>
        <td>${escapeHtml(stu.mobile)}</td>
        <td>${escapeHtml(stu.email)}</td>
        <td><span class="branch-badge">${escapeHtml(stu.branch)}</span></td>
      `;
      studentsTableBody.appendChild(tr);
    });
    studentCountBadge.textContent = `${registeredStudents.length} Students`;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, match => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[match]));
  }

  loadInitialStudents();

  /* --------------------------------------------------------------------------
     2. Dark / Light Theme Toggle
     -------------------------------------------------------------------------- */
  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = htmlElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    htmlElement.setAttribute('data-theme', newTheme);

    if (newTheme === 'light') {
      themeIcon.setAttribute('data-feather', 'moon');
      themeText.textContent = 'Dark Mode';
    } else {
      themeIcon.setAttribute('data-feather', 'sun');
      themeText.textContent = 'Light Mode';
    }
    feather.replace();
  });

  /* --------------------------------------------------------------------------
     3. Password Visibility Toggle
     -------------------------------------------------------------------------- */
  togglePasswordBtn.addEventListener('click', () => {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    passwordEyeIcon.setAttribute('data-feather', type === 'password' ? 'eye' : 'eye-off');
    feather.replace();
  });

  /* --------------------------------------------------------------------------
     4. Helper Functions for Validation States
     -------------------------------------------------------------------------- */
  function setError(input, errorElement, message) {
    const group = input.closest('.form-group');
    group.classList.remove('success');
    group.classList.add('error');
    if (errorElement) {
      errorElement.classList.add('active');
      if (message) {
        const span = errorElement.querySelector('span');
        if (span) span.textContent = message;
      }
    }
  }

  function setSuccess(input, errorElement) {
    const group = input.closest('.form-group');
    group.classList.remove('error');
    group.classList.add('success');
    if (errorElement) {
      errorElement.classList.remove('active');
    }
  }

  /* --------------------------------------------------------------------------
     5. Field Constraint Validations
     -------------------------------------------------------------------------- */
  
  // Constraint 1: Name must be non-empty
  function validateName() {
    const val = nameInput.value.trim();
    if (!val) {
      setError(nameInput, document.getElementById('nameError'), 'Name field cannot be empty.');
      return false;
    }
    setSuccess(nameInput, document.getElementById('nameError'));
    return true;
  }

  // Constraint 2: Mobile must be strictly 10 digits
  function validateMobile() {
    const val = mobileInput.value.trim();
    const isTenDigits = /^[0-9]{10}$/.test(val);
    if (!val) {
      setError(mobileInput, document.getElementById('mobileError'), 'Mobile number cannot be empty.');
      return false;
    } else if (!isTenDigits) {
      setError(mobileInput, document.getElementById('mobileError'), 'Mobile number must be strictly 10 digits (0-9).');
      return false;
    }
    setSuccess(mobileInput, document.getElementById('mobileError'));
    return true;
  }

  // Constraint 3: Email must strictly end with '@gmail.com'
  function validateEmail() {
    const val = emailInput.value.trim();
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    
    if (!val) {
      setError(emailInput, document.getElementById('emailError'), 'Email address cannot be empty.');
      return false;
    } else if (!val.includes('@')) {
      setError(emailInput, document.getElementById('emailError'), "Email must contain an '@' symbol.");
      return false;
    } else if (!val.toLowerCase().endsWith('@gmail.com')) {
      setError(emailInput, document.getElementById('emailError'), "Email domain must strictly be @gmail.com (e.g. name@gmail.com).");
      return false;
    } else if (!gmailRegex.test(val)) {
      setError(emailInput, document.getElementById('emailError'), "Please enter a valid Gmail address format.");
      return false;
    }
    setSuccess(emailInput, document.getElementById('emailError'));
    return true;
  }

  // Constraint 4: Branch must be non-empty
  function validateBranch() {
    const val = branchInput.value;
    if (!val) {
      setError(branchInput, document.getElementById('branchError'), 'Please select your academic branch.');
      return false;
    }
    setSuccess(branchInput, document.getElementById('branchError'));
    return true;
  }

  // Constraint 5: Strong 6-character password (exact length 6, upper, lower, number)
  function validatePassword() {
    const val = passwordInput.value;

    const hasExactLength = val.length === 6;
    const hasUppercase = /[A-Z]/.test(val);
    const hasLowercase = /[a-z]/.test(val);
    const hasNumber = /[0-9]/.test(val);

    // Update Checklist UI items
    toggleReqItem(reqMinLength, hasExactLength);
    toggleReqItem(reqUppercase, hasUppercase);
    toggleReqItem(reqLowercase, hasLowercase);
    toggleReqItem(reqNumber, hasNumber);

    let score = 0;
    if (hasExactLength) score++;
    if (hasUppercase) score++;
    if (hasLowercase) score++;
    if (hasNumber) score++;

    updateStrengthBar(score);

    const isStrong = hasExactLength && hasUppercase && hasLowercase && hasNumber;

    if (!val) {
      setError(passwordInput, document.getElementById('passwordError'), 'Password field cannot be empty.');
      return false;
    } else if (val.length !== 6) {
      setError(passwordInput, document.getElementById('passwordError'), 'Password must be strictly 6 characters long.');
      return false;
    } else if (!isStrong) {
      setError(passwordInput, document.getElementById('passwordError'), 'Password must contain uppercase, lowercase, and a number.');
      return false;
    }
    setSuccess(passwordInput, document.getElementById('passwordError'));
    return true;
  }

  function toggleReqItem(element, isValid) {
    if (isValid) {
      element.classList.add('valid');
    } else {
      element.classList.remove('valid');
    }
  }

  function updateStrengthBar(score) {
    if (passwordInput.value.length === 0) {
      strengthBar.style.width = '0%';
      strengthText.textContent = 'None';
      strengthText.style.color = 'var(--text-muted)';
      return;
    }

    if (score <= 2) {
      strengthBar.style.width = '33%';
      strengthBar.style.backgroundColor = 'var(--error-color)';
      strengthText.textContent = 'Weak';
      strengthText.style.color = 'var(--error-color)';
    } else if (score === 3) {
      strengthBar.style.width = '66%';
      strengthBar.style.backgroundColor = 'var(--warning-color)';
      strengthText.textContent = 'Medium';
      strengthText.style.color = 'var(--warning-color)';
    } else {
      strengthBar.style.width = '100%';
      strengthBar.style.backgroundColor = 'var(--success-color)';
      strengthText.textContent = 'Strong';
      strengthText.style.color = 'var(--success-color)';
    }
  }

  /* --------------------------------------------------------------------------
     6. Real-time Event Listeners for Dynamic Feedback
     -------------------------------------------------------------------------- */
  nameInput.addEventListener('input', validateName);
  nameInput.addEventListener('blur', validateName);

  mobileInput.addEventListener('input', validateMobile);
  mobileInput.addEventListener('blur', validateMobile);

  emailInput.addEventListener('input', validateEmail);
  emailInput.addEventListener('blur', validateEmail);

  branchInput.addEventListener('change', validateBranch);
  branchInput.addEventListener('blur', validateBranch);

  passwordInput.addEventListener('input', validatePassword);
  passwordInput.addEventListener('blur', validatePassword);

  /* --------------------------------------------------------------------------
     7. Form Submission Handler via Button
     -------------------------------------------------------------------------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isNameValid = validateName();
    const isMobileValid = validateMobile();
    const isEmailValid = validateEmail();
    const isBranchValid = validateBranch();
    const isPasswordValid = validatePassword();

    const isFormValid = isNameValid && isMobileValid && isEmailValid && isBranchValid && isPasswordValid;

    if (isFormValid) {
      const nextIdNum = registeredStudents.length + 1;
      const formattedId = `STU${String(nextIdNum).padStart(3, '0')}`;
      
      const newStudent = {
        id: formattedId,
        name: nameInput.value.trim(),
        mobile: mobileInput.value.trim(),
        email: emailInput.value.trim(),
        branch: branchInput.value,
        password: passwordInput.value
      };

      // POST student data to server to store in students.json
      try {
        const response = await fetch('/api/students', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(newStudent)
        });

        if (response.ok) {
          const result = await response.json();
          if (result.students) {
            registeredStudents = result.students;
          } else {
            registeredStudents.push(newStudent);
          }
        } else {
          registeredStudents.push(newStudent);
        }
      } catch (err) {
        console.warn('Backend server not reachable, updated in-memory table:', err);
        registeredStudents.push(newStudent);
      }

      renderStudentsTable();

      // Show success modal
      modalDescription.textContent = `Student ${newStudent.name} (${newStudent.branch}) has been registered and stored in the database!`;
      successModal.classList.add('active');

      // Reset form controls
      form.reset();
      document.querySelectorAll('.form-group').forEach(group => {
        group.classList.remove('error', 'success');
      });
      document.querySelectorAll('.error-message').forEach(msg => {
        msg.classList.remove('active');
      });
      strengthBar.style.width = '0%';
      strengthText.textContent = 'None';
      [reqMinLength, reqUppercase, reqLowercase, reqNumber].forEach(item => item.classList.remove('valid'));
    } else {
      // Focus first invalid element
      const firstInvalid = form.querySelector('.error .form-input, input:invalid');
      if (firstInvalid) {
        firstInvalid.focus();
      }
    }
  });

  closeModalBtn.addEventListener('click', () => {
    successModal.classList.remove('active');
  });
});
